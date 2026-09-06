import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:web_socket_channel/web_socket_channel.dart';

/// Events from the server side of the relay protocol
/// (`relayServerMessageSchema` in `@voxeli/api-contracts`).
sealed class RelayEvent {
  const RelayEvent();
}

class RelayReady extends RelayEvent {
  const RelayReady({required this.sessionId, required this.sampleRate, required this.speakTranslations});
  final String sessionId;
  final int sampleRate;
  final bool speakTranslations;
}

class RelayPartial extends RelayEvent {
  const RelayPartial(this.text);
  final String text;
}

class RelaySegment extends RelayEvent {
  const RelaySegment({required this.segmentId, required this.original, required this.sourceLanguage});
  final String segmentId;
  final String original;
  final String sourceLanguage;
}

class RelayTranslation extends RelayEvent {
  const RelayTranslation({required this.segmentId, required this.text});
  final String segmentId;
  final String text;
}

class RelayAudio extends RelayEvent {
  const RelayAudio({required this.segmentId, required this.mimeType, required this.bytes});
  final String segmentId;
  final String mimeType;
  final Uint8List bytes;
}

class RelayQuota extends RelayEvent {
  const RelayQuota({required this.usedMinutes, required this.limitMinutes});
  final int usedMinutes;
  final int? limitMinutes;
}

class RelayError extends RelayEvent {
  const RelayError({required this.code, required this.message, required this.retryable});
  final String code;
  final String message;
  final bool retryable;
}

class RelayClosed extends RelayEvent {
  const RelayClosed({required this.reason, required this.durationSeconds});
  final String reason;
  final int durationSeconds;
}

/// The socket went away without a `closed` message (network loss).
class RelayDisconnected extends RelayEvent {
  const RelayDisconnected();
}

typedef ChannelFactory = WebSocketChannel Function(Uri uri);

/// Thin protocol layer over one WebSocket. Text frames are JSON control
/// messages; a binary frame from the server is the audio announced by the
/// preceding `audio_begin`. Binary frames to the server are PCM16 audio.
class RelayClient {
  RelayClient(this._uri, {ChannelFactory? channelFactory})
      : _channelFactory = channelFactory ?? WebSocketChannel.connect;

  final Uri _uri;
  final ChannelFactory _channelFactory;
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  final _events = StreamController<RelayEvent>.broadcast();
  ({String segmentId, String mimeType})? _pendingAudio;
  bool _closedByServer = false;

  Stream<RelayEvent> get events => _events.stream;
  bool get isOpen => _channel != null;

  Future<void> connect() async {
    final channel = _channelFactory(_uri);
    _channel = channel;
    await channel.ready;
    _sub = channel.stream.listen(
      _onFrame,
      onError: (Object _) => _events.add(const RelayDisconnected()),
      onDone: () {
        if (!_closedByServer) _events.add(const RelayDisconnected());
        _channel = null;
      },
    );
  }

  void sendAudio(Uint8List pcm16) {
    _channel?.sink.add(pcm16);
  }

  void stop() => _send({'type': 'stop'});
  void interrupt() => _send({'type': 'interrupt'});
  void resume(String? lastSegmentId) => _send({'type': 'resume', 'lastSegmentId': lastSegmentId});

  void _send(Map<String, Object?> message) {
    _channel?.sink.add(jsonEncode(message));
  }

  void _onFrame(dynamic frame) {
    if (frame is List<int>) {
      final pending = _pendingAudio;
      _pendingAudio = null;
      if (pending != null) {
        _events.add(RelayAudio(segmentId: pending.segmentId, mimeType: pending.mimeType, bytes: Uint8List.fromList(frame)));
      }
      return;
    }
    if (frame is! String) return;
    final event = parseServerMessage(frame);
    if (event == null) return;
    if (event is RelayClosed) _closedByServer = true;
    _events.add(event);
  }

  /// Parses one server text frame. Returns null for unknown or malformed input:
  /// server frames are validated, never trusted blindly.
  RelayEvent? parseServerMessage(String frame) {
    Object? decoded;
    try {
      decoded = jsonDecode(frame);
    } catch (_) {
      return null;
    }
    if (decoded is! Map<String, dynamic>) return null;
    final m = decoded;
    switch (m['type']) {
      case 'ready':
        return RelayReady(
          sessionId: m['sessionId'] as String? ?? '',
          sampleRate: m['sampleRate'] as int? ?? 24000,
          speakTranslations: m['speakTranslations'] as bool? ?? true,
        );
      case 'partial':
        return RelayPartial(m['text'] as String? ?? '');
      case 'segment':
        return RelaySegment(
          segmentId: m['segmentId'] as String? ?? '',
          original: m['original'] as String? ?? '',
          sourceLanguage: m['sourceLanguage'] as String? ?? '',
        );
      case 'translation':
        return RelayTranslation(segmentId: m['segmentId'] as String? ?? '', text: m['text'] as String? ?? '');
      case 'audio_begin':
        _pendingAudio = (segmentId: m['segmentId'] as String? ?? '', mimeType: m['mimeType'] as String? ?? 'audio/mpeg');
        return null;
      case 'quota':
        return RelayQuota(usedMinutes: m['usedMinutes'] as int? ?? 0, limitMinutes: m['limitMinutes'] as int?);
      case 'error':
        return RelayError(
          code: m['code'] as String? ?? 'INTERNAL',
          message: m['message'] as String? ?? '',
          retryable: m['retryable'] as bool? ?? false,
        );
      case 'closed':
        return RelayClosed(reason: m['reason'] as String? ?? 'unknown', durationSeconds: m['durationSeconds'] as int? ?? 0);
      default:
        return null;
    }
  }

  Future<void> close() async {
    final channel = _channel;
    _channel = null;
    // Close the sink before dropping the listener; a sink close that never
    // completes (dead network) must not hold up teardown.
    if (channel != null) {
      await channel.sink
          .close()
          .timeout(const Duration(seconds: 1), onTimeout: () {});
    }
    await _sub?.cancel();
    _sub = null;
  }

  Future<void> dispose() async {
    await close();
    // Closing a broadcast controller can leave its `done` future pending when
    // called from within an event chain; teardown must never wait on it.
    unawaited(_events.close());
  }
}
