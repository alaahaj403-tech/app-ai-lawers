import 'dart:async';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';

/// Plays synthesized speech chunks in order; interruptible for barge-in.
abstract class SpeechPlayer {
  /// Queue a clip. Resolves when playback of this clip has finished (or was stopped).
  Future<void> play(Uint8List bytes, {required String mimeType});
  Future<void> stop();
  bool get isPlaying;
  Future<void> dispose();
}

class AudioplayersSpeechPlayer implements SpeechPlayer {
  AudioplayersSpeechPlayer([AudioPlayer? player]) : _player = player ?? AudioPlayer() {
    _sub = _player.onPlayerComplete.listen((_) => _finishCurrent());
  }

  final AudioPlayer _player;
  StreamSubscription<void>? _sub;
  Completer<void>? _current;
  Future<void> _queue = Future.value();

  @override
  bool get isPlaying => _current != null;

  @override
  Future<void> play(Uint8List bytes, {required String mimeType}) {
    final done = Completer<void>();
    _queue = _queue.then((_) async {
      if (done.isCompleted) return; // stopped before it started
      _current = done;
      try {
        await _player.play(BytesSource(bytes, mimeType: mimeType));
      } catch (_) {
        _finishCurrent();
      }
      await done.future;
    });
    return done.future;
  }

  void _finishCurrent() {
    final c = _current;
    _current = null;
    if (c != null && !c.isCompleted) c.complete();
  }

  @override
  Future<void> stop() async {
    await _player.stop();
    _finishCurrent();
  }

  @override
  Future<void> dispose() async {
    await _sub?.cancel();
    await _player.dispose();
  }
}
