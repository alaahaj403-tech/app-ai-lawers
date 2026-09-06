import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:voxeli/app_providers.dart';
import 'package:voxeli/core/audio/audio_capture.dart';
import 'package:voxeli/core/audio/speech_player.dart';
import 'package:voxeli/core/auth/token_store.dart';
import 'package:voxeli/core/network/api_client.dart';
import 'package:voxeli/features/talk/talk_controller.dart';
import 'package:voxeli/main.dart';

import 'relay_client_test.dart' show FakeChannel;

class FakeCapture implements AudioCapture {
  bool permission = true;
  final controller = StreamController<Uint8List>.broadcast();
  int starts = 0;
  int stops = 0;
  @override
  Future<bool> ensurePermission() async => permission;
  @override
  Future<Stream<Uint8List>> start({required int sampleRate}) async {
    starts++;
    return controller.stream;
  }
  @override
  Future<void> stop() async => stops++;
}

class FakePlayer implements SpeechPlayer {
  final played = <String>[];
  int stopCalls = 0;
  bool _playing = false;
  @override
  bool get isPlaying => _playing;
  @override
  Future<void> play(Uint8List bytes, {required String mimeType}) async {
    _playing = true;
    played.add(mimeType);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    _playing = false;
  }
  @override
  Future<void> stop() async {
    stopCalls++;
    _playing = false;
  }
  @override
  Future<void> dispose() async {}
}

/// Answers the session bootstrap and ticket endpoints without a network.
class FakeApiAdapter implements HttpClientAdapter {
  int sessions = 0;
  int tickets = 0;
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    if (options.path.endsWith('/v1/realtime/sessions')) {
      sessions++;
      return ResponseBody.fromString(
        jsonEncode({
          'sessionId': 'sess-1',
          'tier': 'tier2_streaming',
          'relay': {'path': '/v1/realtime/stream', 'ticket': 'ticket-1', 'expiresAt': '2026-01-01T00:00:00Z'},
          'clientSecret': null,
          'endpoint': null,
          'degraded': true,
          'quota': {'dimension': 'realtime_minutes', 'used': 0, 'limit': 10},
        }),
        201,
        headers: {'content-type': ['application/json']},
      );
    }
    if (options.path.endsWith('/ticket')) {
      tickets++;
      return ResponseBody.fromString(
        jsonEncode({'relay': {'path': '/v1/realtime/stream', 'ticket': 'ticket-2', 'expiresAt': '2026-01-01T00:00:00Z'}}),
        200,
        headers: {'content-type': ['application/json']},
      );
    }
    return ResponseBody.fromString('{}', 404, headers: {'content-type': ['application/json']});
  }
  @override
  void close({bool force = false}) {}
}

void main() {
  late FakeCapture capture;
  late FakePlayer player;
  late FakeApiAdapter adapter;
  final channels = <FakeChannel>[];

  ProviderContainer makeContainer() {
    capture = FakeCapture();
    player = FakePlayer();
    adapter = FakeApiAdapter();
    channels.clear();
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local:4000'))..httpClientAdapter = adapter;
    final container = ProviderContainer(overrides: [
      tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
      apiClientProvider.overrideWith((ref) => ApiClient(baseUrl: 'http://test.local:4000', tokens: MemoryTokenStore(), dio: dio)),
      audioCaptureProvider.overrideWithValue(capture),
      speechPlayerProvider.overrideWithValue(player),
      channelFactoryProvider.overrideWithValue((uri) {
        expect(uri.scheme, 'ws');
        expect(uri.path, '/v1/realtime/stream');
        final c = FakeChannel();
        channels.add(c);
        return c;
      }),
    ]);
    return container;
  }

  /// Let real async work (permission → HTTP → socket → streams) run, then render.
  /// The fake test clock does not drive the fake network adapter, so these
  /// steps run under `runAsync`; the controller's own logic is covered by
  /// talk_controller_test.dart.
  /// Run an interaction in the real async zone (so the fake network adapter
  /// and stream controllers complete), then render one frame.
  Future<void> act(WidgetTester tester, FutureOr<void> Function() action, [int ms = 60]) async {
    await tester.runAsync(() async {
      await action();
      await Future<void>.delayed(Duration(milliseconds: ms));
    });
    await tester.pump();
  }

  Future<void> pumpApp(WidgetTester tester, ProviderContainer container) async {
    await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const VoxeliApp(locale: Locale('he'))));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('nav_talk')));
    await tester.pumpAndSettle();
  }

  testWidgets('starts a session, streams audio, shows captions and plays speech', (tester) async {
    final container = makeContainer();
    addTearDown(container.dispose);
    await pumpApp(tester, container);
    expect(find.text('דברו בשפה שלכם. הצד השני שומע בשפה שלו.'), findsOneWidget);

    await act(tester, () => tester.tap(find.byKey(const Key('talk_mic_button'))));
    expect(adapter.sessions, 1);
    expect(channels, hasLength(1));
    final ch = channels.single;

    await act(tester, () => ch.incoming.add(jsonEncode({'type': 'ready', 'sessionId': 'sess-1', 'sampleRate': 24000, 'speakTranslations': true})));
    expect(capture.starts, 1);
    expect(find.text('מקשיב'), findsOneWidget);
    expect(find.text('המיקרופון פועל'), findsOneWidget);

    // Microphone chunks go straight to the socket as binary.
    await act(tester, () => capture.controller.add(Uint8List(960)));
    expect(ch.sent.whereType<Uint8List>(), hasLength(1));

    await act(tester, () => ch.incoming.add(jsonEncode({'type': 'partial', 'text': 'שלום, מה'})));
    expect(find.text('שלום, מה'), findsOneWidget);

    await act(tester, () {
      ch.incoming.add(jsonEncode({'type': 'segment', 'segmentId': 'seg_1', 'original': 'שלום, מה שלומך?', 'sourceLanguage': 'he'}));
      ch.incoming.add(jsonEncode({'type': 'translation', 'segmentId': 'seg_1', 'text': 'Hello, how are you?'}));
      ch.incoming.add(jsonEncode({'type': 'audio_begin', 'segmentId': 'seg_1', 'mimeType': 'audio/mpeg', 'byteLength': 3}));
      ch.incoming.add(<int>[1, 2, 3]);
    }, 5);
    expect(find.text('שלום, מה שלומך?'), findsOneWidget);
    expect(find.text('Hello, how are you?'), findsOneWidget);
    expect(find.text('מדבר'), findsOneWidget);
    expect(player.played, ['audio/mpeg']);

    // Barge-in: loud microphone input while speaking cuts playback and tells the server.
    final loud = Uint8List(960);
    final view = ByteData.sublistView(loud);
    for (var i = 0; i < 960; i += 2) {
      view.setInt16(i, 12000, Endian.little);
    }
    await act(tester, () => capture.controller.add(loud));
    expect(player.stopCalls, greaterThanOrEqualTo(1));
    expect(ch.sent.whereType<String>().map((s) => jsonDecode(s)['type']), contains('interrupt'));

    // Stop → server confirms → ended state with duration.
    await act(tester, () => tester.tap(find.byKey(const Key('talk_mic_button'))));
    expect(ch.sent.whereType<String>().map((s) => jsonDecode(s)['type']), contains('stop'));
    await act(tester, () => ch.incoming.add(jsonEncode({'type': 'closed', 'reason': 'client_stopped', 'durationSeconds': 65})));
    expect(find.text('הסתיים'), findsOneWidget);
    expect(find.textContaining('01:05'), findsOneWidget);
    expect(capture.stops, greaterThanOrEqualTo(1));
  });

  testWidgets('reconnects with a fresh ticket after the socket drops and asks for missed segments', (tester) async {
    final container = makeContainer();
    addTearDown(container.dispose);
    await pumpApp(tester, container);
    await act(tester, () => tester.tap(find.byKey(const Key('talk_mic_button'))));
    final first = channels.single;
    await act(tester, () {
      first.incoming.add(jsonEncode({'type': 'ready', 'sessionId': 'sess-1', 'sampleRate': 24000, 'speakTranslations': true}));
      first.incoming.add(jsonEncode({'type': 'segment', 'segmentId': 'seg_1', 'original': 'a', 'sourceLanguage': 'he'}));
    });

    // Network loss: the stream ends without a `closed` message. The controller
    // fetches a fresh ticket and reattaches; the UI shows the reconnecting state
    // until the new socket says ready.
    await act(tester, () => first.incoming.close());
    expect(adapter.tickets, 1);
    expect(channels, hasLength(2));
    final second = channels[1];
    expect(jsonDecode(second.sent.first as String), {'type': 'resume', 'lastSegmentId': 'seg_1'});

    expect(container.read(talkControllerProvider).status, TalkStatus.reconnecting);
    expect(find.text('מתחבר מחדש…'), findsOneWidget);
    await act(tester, () {
      second.incoming.add(jsonEncode({'type': 'ready', 'sessionId': 'sess-1', 'sampleRate': 24000, 'speakTranslations': true}));
      // Replayed segment must not be duplicated in the captions.
      second.incoming.add(jsonEncode({'type': 'segment', 'segmentId': 'seg_1', 'original': 'a', 'sourceLanguage': 'he'}));
    });
    expect(container.read(talkControllerProvider).captions, hasLength(1));
    expect(find.text('מקשיב'), findsOneWidget);
    // The microphone kept running across the reconnect.
    expect(capture.starts, 1);

    await tester.runAsync(() => container.read(talkControllerProvider.notifier).stop());
    await tester.pump();
  });

  testWidgets('a denied microphone permission is shown without starting a session', (tester) async {
    final container = makeContainer();
    addTearDown(container.dispose);
    capture.permission = false;
    await pumpApp(tester, container);
    await act(tester, () => tester.tap(find.byKey(const Key('talk_mic_button'))));
    expect(adapter.sessions, 0);
    expect(find.byKey(const Key('talk_failure')), findsOneWidget);
    expect(find.textContaining('המיקרופון'), findsWidgets);
  });
}
