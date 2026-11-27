import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app_providers.dart';
import '../../core/audio/audio_capture.dart';
import '../../core/audio/speech_player.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_failure.dart';
import 'relay_client.dart';

enum TalkStatus { idle, connecting, listening, translating, speaking, reconnecting, ended, failed }

class Caption {
  const Caption({required this.id, required this.original, this.translated});
  final String id;
  final String original;
  final String? translated;
  Caption withTranslation(String text) => Caption(id: id, original: original, translated: text);
}

class TalkState {
  const TalkState({
    this.status = TalkStatus.idle,
    this.myLanguage = 'he',
    this.targetLanguage = 'en',
    this.speakTranslations = true,
    this.captions = const [],
    this.partial = '',
    this.level = 0,
    this.usedMinutes,
    this.limitMinutes,
    this.failure,
    this.closeReason,
    this.durationSeconds = 0,
    this.sessionId,
  });

  final TalkStatus status;
  final String myLanguage;
  final String targetLanguage;
  final bool speakTranslations;
  final List<Caption> captions;
  final String partial;
  /// Microphone level 0..1 for the waveform.
  final double level;
  final int? usedMinutes;
  final int? limitMinutes;
  final ApiFailure? failure;
  final String? closeReason;
  final int durationSeconds;
  final String? sessionId;

  bool get isActive => status == TalkStatus.connecting || status == TalkStatus.listening || status == TalkStatus.translating || status == TalkStatus.speaking || status == TalkStatus.reconnecting;
  bool get micOn => status == TalkStatus.listening || status == TalkStatus.translating || status == TalkStatus.speaking;

  TalkState copyWith({
    TalkStatus? status,
    String? myLanguage,
    String? targetLanguage,
    bool? speakTranslations,
    List<Caption>? captions,
    String? partial,
    double? level,
    int? usedMinutes,
    int? limitMinutes,
    ApiFailure? failure,
    bool clearFailure = false,
    String? closeReason,
    int? durationSeconds,
    String? sessionId,
  }) =>
      TalkState(
        status: status ?? this.status,
        myLanguage: myLanguage ?? this.myLanguage,
        targetLanguage: targetLanguage ?? this.targetLanguage,
        speakTranslations: speakTranslations ?? this.speakTranslations,
        captions: captions ?? this.captions,
        partial: partial ?? this.partial,
        level: level ?? this.level,
        usedMinutes: usedMinutes ?? this.usedMinutes,
        limitMinutes: limitMinutes ?? this.limitMinutes,
        failure: clearFailure ? null : (failure ?? this.failure),
        closeReason: closeReason ?? this.closeReason,
        durationSeconds: durationSeconds ?? this.durationSeconds,
        sessionId: sessionId ?? this.sessionId,
      );
}

/// Barge-in: microphone energy above this while speech plays stops playback.
const _bargeInRms = 0.08;

/// Drives one live session: session bootstrap → relay socket → microphone →
/// captions and speech playback, with reconnect on network loss.
class TalkController extends Notifier<TalkState> {
  RelayClient? _relay;
  StreamSubscription<RelayEvent>? _relaySub;
  StreamSubscription<Uint8List>? _micSub;
  Future<void> _playback = Future.value();
  bool _reconnecting = false;

  // Resolved once per build: `ref` must not be touched after async gaps or in onDispose.
  late ApiClient _api;
  late AudioCapture _capture;
  late SpeechPlayer _player;
  late ChannelFactory _channelFactory;
  bool _disposed = false;

  @override
  TalkState build() {
    _api = ref.read(apiClientProvider);
    _capture = ref.read(audioCaptureProvider);
    _player = ref.read(speechPlayerProvider);
    _channelFactory = ref.read(channelFactoryProvider);
    ref.onDispose(() {
      _disposed = true;
      unawaited(_teardown());
    });
    return const TalkState();
  }

  void setMyLanguage(String code) {
    if (!state.isActive) state = state.copyWith(myLanguage: code);
  }

  void setTargetLanguage(String code) {
    if (!state.isActive) state = state.copyWith(targetLanguage: code);
  }

  void toggleSpeak() {
    state = state.copyWith(speakTranslations: !state.speakTranslations);
    if (!state.speakTranslations) _player.stop();
  }

  Future<void> start() async {
    if (state.isActive) return;
    state = state.copyWith(status: TalkStatus.connecting, captions: const [], partial: '', clearFailure: true, closeReason: null, durationSeconds: 0);

    if (!await _capture.ensurePermission()) {
      state = state.copyWith(status: TalkStatus.failed, failure: const ApiFailure(code: 'PERMISSION_DENIED', message: 'Microphone permission denied', retryable: false));
      return;
    }

    try {
      final session = await _api.post('/v1/realtime/sessions', body: {
        'kind': 'face_to_face',
        'myLanguage': state.myLanguage,
        'targetLanguage': state.targetLanguage,
        'transport': 'websocket',
        'preferredTier': 'tier2_streaming',
      });
      final relay = session['relay'] as Map<String, dynamic>?;
      final ticket = relay?['ticket'] as String?;
      final path = relay?['path'] as String?;
      if (ticket == null || path == null) {
        throw const ApiFailure(code: 'UNSUPPORTED_PLATFORM_CAPABILITY', message: 'Relay not available', retryable: false);
      }
      final quota = session['quota'] as Map<String, dynamic>? ?? const {};
      state = state.copyWith(sessionId: session['sessionId'] as String?, usedMinutes: quota['used'] as int?, limitMinutes: quota['limit'] as int?);
      await _connect(path, ticket, resumeFrom: null);
    } on ApiFailure catch (e) {
      state = state.copyWith(status: TalkStatus.failed, failure: e);
      await _teardown();
    }
  }

  Future<void> _connect(String path, String ticket, {required String? resumeFrom, bool resume = false}) async {
    await _relaySub?.cancel();
    await _relay?.dispose();
    final relay = RelayClient(_api.websocketUri(path, {'ticket': ticket}), channelFactory: _channelFactory);
    _relay = relay;
    _relaySub = relay.events.listen(_onEvent);
    try {
      await relay.connect();
    } catch (_) {
      throw const ApiFailure(code: 'NETWORK_FAILURE', message: 'Could not reach the server', retryable: true);
    }
    if (resume) relay.resume(resumeFrom);
  }

  Future<void> _startMicrophone(int sampleRate) async {
    await _micSub?.cancel();
    final stream = await _capture.start(sampleRate: sampleRate);
    _micSub = stream.listen((chunk) {
      if (_disposed) return;
      final level = pcm16Rms(chunk);
      if (state.status == TalkStatus.speaking && level > _bargeInRms) {
        // The user started talking over the translation: cut playback.
        _player.stop();
        _relay?.interrupt();
        state = state.copyWith(status: TalkStatus.listening);
      }
      if ((level - state.level).abs() > 0.02) state = state.copyWith(level: level);
      _relay?.sendAudio(chunk);
    });
  }

  void _onEvent(RelayEvent event) {
    if (_disposed) return;
    switch (event) {
      case RelayReady(:final sampleRate):
        final wasReconnecting = state.status == TalkStatus.reconnecting;
        state = state.copyWith(status: TalkStatus.listening);
        if (!wasReconnecting || _micSub == null) {
          _startMicrophone(sampleRate).catchError((Object e) {
            state = state.copyWith(status: TalkStatus.failed, failure: const ApiFailure(code: 'PERMISSION_DENIED', message: 'Microphone unavailable', retryable: false));
            stop();
          });
        }
      case RelayPartial(:final text):
        state = state.copyWith(partial: text, status: text.isEmpty ? state.status : TalkStatus.listening);
      case RelaySegment(:final segmentId, :final original):
        if (state.captions.any((c) => c.id == segmentId)) return; // replayed on resume
        state = state.copyWith(
          captions: [...state.captions, Caption(id: segmentId, original: original)],
          partial: '',
          status: TalkStatus.translating,
        );
      case RelayTranslation(:final segmentId, :final text):
        state = state.copyWith(
          captions: [for (final c in state.captions) if (c.id == segmentId) c.withTranslation(text) else c],
          status: state.speakTranslations ? state.status : TalkStatus.listening,
        );
      case RelayAudio(:final bytes, :final mimeType):
        if (!state.speakTranslations) return;
        _playback = _playback.then((_) async {
          if (_disposed || !state.isActive) return;
          state = state.copyWith(status: TalkStatus.speaking);
          await _player.play(bytes, mimeType: mimeType);
          if (!_disposed && state.status == TalkStatus.speaking) state = state.copyWith(status: TalkStatus.listening);
        });
      case RelayQuota(:final usedMinutes, :final limitMinutes):
        state = state.copyWith(usedMinutes: usedMinutes, limitMinutes: limitMinutes);
      case RelayError(:final code, :final message, :final retryable):
        state = state.copyWith(failure: ApiFailure(code: code, message: message, retryable: retryable));
      case RelayClosed(:final reason, :final durationSeconds):
        state = state.copyWith(status: TalkStatus.ended, closeReason: reason, durationSeconds: durationSeconds, level: 0);
        _teardown();
      case RelayDisconnected():
        if (state.isActive && !_reconnecting) _reconnect();
    }
  }

  /// Network loss: keep the microphone running, fetch a fresh ticket, reattach,
  /// and ask the server for whatever we missed. The server holds the session
  /// for a grace window; if it is gone, end cleanly.
  Future<void> _reconnect() async {
    final sessionId = state.sessionId;
    if (sessionId == null) return;
    _reconnecting = true;
    state = state.copyWith(status: TalkStatus.reconnecting);
    final lastSegmentId = state.captions.isEmpty ? null : state.captions.last.id;
    try {
      for (var attempt = 0; attempt < 3; attempt++) {
        try {
          final res = await _api.post('/v1/realtime/sessions/$sessionId/ticket');
          final relay = res['relay'] as Map<String, dynamic>;
          await _connect(relay['path'] as String, relay['ticket'] as String, resumeFrom: lastSegmentId, resume: true);
          return;
        } on ApiFailure catch (e) {
          if (!e.retryable && e.code != 'NETWORK_FAILURE') rethrow;
          await Future<void>.delayed(Duration(milliseconds: 500 * (attempt + 1)));
        }
      }
      throw const ApiFailure(code: 'REALTIME_DISCONNECTED', message: 'Connection lost', retryable: true);
    } on ApiFailure catch (e) {
      if (!_disposed) state = state.copyWith(status: TalkStatus.failed, failure: e, level: 0);
      await _teardown();
    } finally {
      _reconnecting = false;
    }
  }

  Future<void> stop() async {
    if (!state.isActive) return;
    _relay?.stop();
    await _micSub?.cancel();
    _micSub = null;
    await _capture.stop();
    // The server answers with `closed`; if it does not within a moment, end locally.
    await Future<void>.delayed(const Duration(milliseconds: 800));
    if (_disposed) return;
    if (state.isActive) {
      state = state.copyWith(status: TalkStatus.ended, closeReason: 'client_stopped', level: 0);
      await _teardown();
    }
  }

  Future<void> _teardown() async {
    await _micSub?.cancel();
    _micSub = null;
    await _capture.stop();
    await _player.stop();
    await _relaySub?.cancel();
    _relaySub = null;
    await _relay?.dispose();
    _relay = null;
  }
}

final talkControllerProvider = NotifierProvider<TalkController, TalkState>(TalkController.new);
