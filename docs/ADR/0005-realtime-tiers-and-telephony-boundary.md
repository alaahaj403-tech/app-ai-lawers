# ADR-0005: Realtime translation tiers and the telephony boundary

**Status:** accepted · 2026-09-04

## Decision

Realtime is a **streaming pipeline from Milestone 0**, not post-processing:

```
AudioInputSource → StreamingRecognizer → IncrementalSegmenter → SegmentTranslator → SpeechSink
                         (ledger, echo guard, latency meter, barge-in, reconnect dedupe)
```

- **Tier 1** direct speech-to-speech (`gpt-realtime-translate`, ephemeral client secret, WebRTC from the device). **Tier 2** streaming STT (`gpt-live-transcribe`) → text translation → streaming TTS, orchestrated by `RealtimeTranslationPipeline` (`@voxeli/realtime-core`). **Tier 3** chunked STT→MT→TTS as last resort. Selection is server-side (`AIModelRouter.selectRealtimeTier`) and always explains degradation (`degradedReason`).
- The server hands the client an **ephemeral credential** only; the API key never leaves the server.
- **Segmentation** emits on clause boundaries (Latin/Hebrew/Arabic/CJK terminators), silence (700 ms), soft (120) and hard (240 chars) limits; short fragments wait to avoid churn.
- **EchoGuard** suppresses transcripts that match recently spoken output (Dice ≥ 0.8 within 8 s) — regression-tested — as the semantic backstop to platform AEC/NS/AGC.
- **SessionLedger** stores confirmed originals immutably, attaches translations, and de-duplicates after reconnect; the raw transcript is never overwritten.
- **LatencyMeter** records capture/network/recognition/translation/synthesis/playback plus first-transcript/first-translation/first-audio/interruption/reconnect. "Fast" is not a metric.

## Telephony boundary

- **In-app VoIP/WebRTC calls (Category A):** we own the media path → full AI Interpreter Call architecture. Provider adapter `TelephonyProvider` to be evaluated (WebRTC/SIP/PSTN bridge); not vendor-locked.
- **Ordinary cellular calls (B/C):** third-party apps do not receive both audio legs on Android or iOS. Marked `UNSUPPORTED_PLATFORM_CAPABILITY` in the capability matrix. **Prohibited:** hidden APIs, AccessibilityService abuse, root, private Apple APIs, OEM exploits, microphone workarounds. Supported alternative: telephony bridge (SIP/PSTN gateway → realtime engine → remote party), to be selected dynamically.

## Consequences

- The client (Flutter) will host `MicrophoneAudioSource`, VoIP sources and the WebRTC/WebSocket transports; the core logic above is platform-neutral and already unit-tested.
- Minutes are currently accounted from the client's end-of-session report; moving accounting to a server media path is tracked in TECH_DEBT.
