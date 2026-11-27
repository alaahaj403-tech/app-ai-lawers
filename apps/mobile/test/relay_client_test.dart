import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:stream_channel/stream_channel.dart';
import 'package:voxeli/features/talk/relay_client.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// In-memory WebSocketChannel: what the server "sends" goes into [incoming],
/// what the client sends shows up in [sent].
class FakeChannel extends StreamChannelMixin<dynamic> implements WebSocketChannel {
  final incoming = StreamController<dynamic>();
  final sent = <dynamic>[];
  late final _SinkRecorder _sink = _SinkRecorder(sent, () => incoming.close());
  @override
  Stream<dynamic> get stream => incoming.stream;
  @override
  WebSocketSink get sink => _sink;
  @override
  Future<void> get ready => Future.value();
  @override
  int? get closeCode => null;
  @override
  String? get closeReason => null;
  @override
  String? get protocol => null;
}

class _SinkRecorder implements WebSocketSink {
  _SinkRecorder(this._sent, this._onClose);
  final List<dynamic> _sent;
  final Future<void> Function() _onClose;
  @override
  void add(dynamic data) => _sent.add(data);
  @override
  void addError(Object error, [StackTrace? stackTrace]) {}
  @override
  Future<void> addStream(Stream<dynamic> stream) => stream.forEach(add);
  @override
  Future<void> close([int? closeCode, String? closeReason]) {
    // A real WebSocketSink resolves when the socket is closed; the fake must
    // not hang teardown on an already-closed controller.
    _onClose().ignore();
    return Future.value();
  }
  @override
  Future<void> get done => Future.value();
}

void main() {
  late FakeChannel channel;
  late RelayClient client;

  setUp(() async {
    channel = FakeChannel();
    client = RelayClient(Uri.parse('ws://x/v1/realtime/stream?ticket=t'), channelFactory: (_) => channel);
    await client.connect();
  });

  tearDown(() => client.dispose());

  test('parses the server protocol and pairs audio_begin with the next binary frame', () async {
    final events = <RelayEvent>[];
    final sub = client.events.listen(events.add);
    channel.incoming
      ..add(jsonEncode({'type': 'ready', 'sessionId': 's1', 'sampleRate': 24000, 'speakTranslations': true}))
      ..add(jsonEncode({'type': 'quota', 'usedMinutes': 1, 'limitMinutes': 10}))
      ..add(jsonEncode({'type': 'partial', 'text': 'שלום'}))
      ..add(jsonEncode({'type': 'segment', 'segmentId': 'seg_1', 'original': 'שלום, מה שלומך?', 'sourceLanguage': 'he'}))
      ..add(jsonEncode({'type': 'translation', 'segmentId': 'seg_1', 'text': 'Hello, how are you?'}))
      ..add(jsonEncode({'type': 'audio_begin', 'segmentId': 'seg_1', 'mimeType': 'audio/mpeg', 'byteLength': 3}))
      ..add(<int>[1, 2, 3])
      ..add('not json')
      ..add(jsonEncode({'type': 'unknown_future_message'}))
      ..add(jsonEncode({'type': 'closed', 'reason': 'client_stopped', 'durationSeconds': 42}));
    await Future<void>.delayed(Duration.zero);
    await sub.cancel();

    expect(events.map((e) => e.runtimeType.toString()).toList(), [
      'RelayReady', 'RelayQuota', 'RelayPartial', 'RelaySegment', 'RelayTranslation', 'RelayAudio', 'RelayClosed',
    ]);
    final audio = events.whereType<RelayAudio>().single;
    expect(audio.segmentId, 'seg_1');
    expect(audio.mimeType, 'audio/mpeg');
    expect(audio.bytes, Uint8List.fromList([1, 2, 3]));
    expect(events.whereType<RelayClosed>().single.durationSeconds, 42);
  });

  test('sends audio as binary and control messages as JSON', () {
    client.sendAudio(Uint8List.fromList([9, 9]));
    client.resume('seg_3');
    client.interrupt();
    client.stop();
    expect(channel.sent[0], isA<Uint8List>());
    expect(jsonDecode(channel.sent[1] as String), {'type': 'resume', 'lastSegmentId': 'seg_3'});
    expect(jsonDecode(channel.sent[2] as String), {'type': 'interrupt'});
    expect(jsonDecode(channel.sent[3] as String), {'type': 'stop'});
  });

  test('a socket that ends without a closed message is reported as a disconnect', () async {
    final events = <RelayEvent>[];
    final sub = client.events.listen(events.add);
    await channel.incoming.close();
    await Future<void>.delayed(Duration.zero);
    await sub.cancel();
    expect(events.whereType<RelayDisconnected>(), hasLength(1));
  });

  test('a binary frame without a preceding audio_begin is ignored', () async {
    final events = <RelayEvent>[];
    final sub = client.events.listen(events.add);
    channel.incoming.add(<int>[1, 2]);
    await Future<void>.delayed(Duration.zero);
    await sub.cancel();
    expect(events, isEmpty);
  });
}
