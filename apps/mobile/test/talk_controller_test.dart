import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:voxeli/app_providers.dart';
import 'package:voxeli/core/auth/token_store.dart';
import 'package:voxeli/core/network/api_client.dart';
import 'package:voxeli/features/talk/talk_controller.dart';

import 'relay_client_test.dart' show FakeChannel;
import 'talk_screen_test.dart' show FakeApiAdapter, FakeCapture, FakePlayer;

/// Pure-Dart flow tests (real async, no widget clock) so protocol logic is
/// verified independently of frame pumping.
void main() {
  late FakeCapture capture;
  late FakePlayer player;
  late FakeApiAdapter adapter;
  final channels = <FakeChannel>[];

  ProviderContainer make() {
    capture = FakeCapture();
    player = FakePlayer();
    adapter = FakeApiAdapter();
    channels.clear();
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local:4000'))..httpClientAdapter = adapter;
    return ProviderContainer(overrides: [
      tokenStoreProvider.overrideWithValue(MemoryTokenStore()),
      apiClientProvider.overrideWith((ref) => ApiClient(baseUrl: 'http://test.local:4000', tokens: MemoryTokenStore(), dio: dio)),
      audioCaptureProvider.overrideWithValue(capture),
      speechPlayerProvider.overrideWithValue(player),
      channelFactoryProvider.overrideWithValue((uri) {
        final c = FakeChannel();
        channels.add(c);
        return c;
      }),
    ]);
  }

  Future<void> tick([int ms = 10]) => Future<void>.delayed(Duration(milliseconds: ms));

  test('barge-in stops playback and notifies the server', () async {
    final c = make();
    addTearDown(c.dispose);
    final ctl = c.read(talkControllerProvider.notifier);
    await ctl.start();
    await tick();
    final ch = channels.single;
    ch.incoming.add(jsonEncode({'type': 'ready', 'sessionId': 'sess-1', 'sampleRate': 24000, 'speakTranslations': true}));
    await tick();
    expect(c.read(talkControllerProvider).status, TalkStatus.listening);
    ch.incoming.add(jsonEncode({'type': 'audio_begin', 'segmentId': 'seg_1', 'mimeType': 'audio/mpeg', 'byteLength': 3}));
    ch.incoming.add(<int>[1, 2, 3]);
    await tick();
    expect(c.read(talkControllerProvider).status, TalkStatus.speaking);
    final loud = Uint8List(960);
    final view = ByteData.sublistView(loud);
    for (var i = 0; i < 960; i += 2) {
      view.setInt16(i, 12000, Endian.little);
    }
    capture.controller.add(loud);
    await tick();
    expect(player.stopCalls, 1);
    expect(ch.sent.whereType<String>().map((s) => jsonDecode(s)['type']), contains('interrupt'));
    expect(c.read(talkControllerProvider).status, TalkStatus.listening);
    await ctl.stop();
  });

  test('reconnects with a fresh ticket and resumes from the last segment', () async {
    final c = make();
    addTearDown(c.dispose);
    final ctl = c.read(talkControllerProvider.notifier);
    await ctl.start();
    await tick();
    final first = channels.single;
    first.incoming.add(jsonEncode({'type': 'ready', 'sessionId': 'sess-1', 'sampleRate': 24000, 'speakTranslations': true}));
    first.incoming.add(jsonEncode({'type': 'segment', 'segmentId': 'seg_1', 'original': 'a', 'sourceLanguage': 'he'}));
    await tick();
    await first.incoming.close();
    await tick(50);
    expect(adapter.tickets, 1, reason: 'a fresh ticket was requested');
    expect(channels, hasLength(2), reason: 'a second socket was opened');
    expect(jsonDecode(channels[1].sent.first as String), {'type': 'resume', 'lastSegmentId': 'seg_1'});
    expect(c.read(talkControllerProvider).status, TalkStatus.reconnecting);
    channels[1].incoming.add(jsonEncode({'type': 'ready', 'sessionId': 'sess-1', 'sampleRate': 24000, 'speakTranslations': true}));
    channels[1].incoming.add(jsonEncode({'type': 'segment', 'segmentId': 'seg_1', 'original': 'a', 'sourceLanguage': 'he'}));
    await tick();
    expect(c.read(talkControllerProvider).status, TalkStatus.listening);
    expect(c.read(talkControllerProvider).captions, hasLength(1));
    expect(capture.starts, 1, reason: 'microphone kept running');
    await ctl.stop();
  });
}
