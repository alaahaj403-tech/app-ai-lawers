import 'dart:typed_data';

import 'package:record/record.dart';

/// Microphone source for the relay: little-endian PCM16 mono frames.
abstract class AudioCapture {
  /// Asks for permission if needed. False means the user declined.
  Future<bool> ensurePermission();
  Future<Stream<Uint8List>> start({required int sampleRate});
  Future<void> stop();
}

class RecorderAudioCapture implements AudioCapture {
  RecorderAudioCapture([AudioRecorder? recorder]) : _recorder = recorder ?? AudioRecorder();
  final AudioRecorder _recorder;

  @override
  Future<bool> ensurePermission() => _recorder.hasPermission();

  @override
  Future<Stream<Uint8List>> start({required int sampleRate}) => _recorder.startStream(
        RecordConfig(
          encoder: AudioEncoder.pcm16bits,
          sampleRate: sampleRate,
          numChannels: 1,
          // Platform echo cancellation / noise suppression / AGC: the first
          // line of defence against the interpreter hearing itself.
          echoCancel: true,
          noiseSuppress: true,
          autoGain: true,
        ),
      );

  @override
  Future<void> stop() async {
    await _recorder.stop();
  }
}

/// Root-mean-square level of a PCM16 chunk, 0..1. Used for the waveform and
/// for barge-in detection while translated speech is playing.
double pcm16Rms(Uint8List bytes) {
  final usable = bytes.lengthInBytes - (bytes.lengthInBytes % 2);
  if (usable == 0) return 0;
  final data = ByteData.sublistView(bytes, 0, usable);
  var sum = 0.0;
  for (var i = 0; i < usable; i += 2) {
    final v = data.getInt16(i, Endian.little).toDouble();
    sum += v * v;
  }
  return (sum / (usable / 2)).sqrt() / 32768.0;
}

extension on double {
  double sqrt() => this <= 0 ? 0 : _sqrt(this);
}

double _sqrt(double x) {
  // Newton iteration; avoids importing dart:math into a hot audio path.
  var r = x;
  for (var i = 0; i < 20; i++) {
    r = 0.5 * (r + x / r);
  }
  return r;
}
