# ADR-0004: AI provider abstraction, model routing and verified model IDs

**Status:** accepted · 2026-09-04

## Context

Model names change monthly; the mobile app must survive model replacement without a release; cost and latency differ by an order of magnitude between tiers.

## Decision

- Application code requests a **capability slot** (`translation.default`, `translation.highQuality`, `speech.transcription.live`, `realtime.translation`, …). `AIModelRouter` (`@voxeli/ai-core`) maps slots to `{provider, model}` from **server-controlled config** (`DEFAULT_MODEL_CONFIG` + `VOXELI_MODEL_*` env overrides, later admin console).
- Routing inputs: plan, requested quality, provider health (circuit breaker per provider/model), timeout. Failover is ordered and finite; every attempt is recorded in `ai_usage` with latency, tokens, success, `fallbackFrom` and an **advisory** cost estimate (null when price unknown — never invented).
- Providers implement narrow interfaces (`TranslationProvider`, `RealtimeTranslationProvider`, `SpeechToTextProvider`, `TextToSpeechProvider`). Provider-specific structures never leave `ai-core`.
- Text translation uses the **Responses API with strict structured outputs** (`responses.parse` + `zodTextFormat`); the parsed object is **re-validated** with our own Zod schema because model output is untrusted.
- A deterministic **mock provider** backs dev/test. Production refuses to boot in mock mode (env validation).

## Verified model IDs (official OpenAI docs, fetched 2026-09-04)

| Slot                      | Model                    | Note                                            |
| ------------------------- | ------------------------ | ----------------------------------------------- |
| translation.default       | `gpt-5.6-terra`          | balanced                                        |
| translation.fast          | `gpt-5.6-luna`           | cost-sensitive                                  |
| translation.highQuality   | `gpt-5.6-sol`            | flagship                                        |
| reasoning.default         | `gpt-5.6-sol`            |                                                 |
| speech.transcription      | `gpt-transcribe`         | file transcription, `languages` hint            |
| speech.transcription.live | `gpt-live-transcribe`    | streaming deltas without commit                 |
| speech.synthesis          | `gpt-4o-mini-tts`        | voices `marin`/`cedar` recommended              |
| realtime.conversation     | `gpt-realtime-2.1-mini`  |                                                 |
| realtime.translation      | `gpt-realtime-translate` | dedicated speech-to-speech translation endpoint |

Realtime endpoints: `POST /v1/realtime/client_secrets` (realtime/transcription sessions), `POST /v1/realtime/translations/client_secrets` (translation sessions), WebRTC `…/realtime/translations/calls`, WebSocket `wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate`. Client secrets expire in 10–7200 s (we use 300 s).

**Unverified / open:** the full target-language list for `gpt-realtime-translate` is not enumerated in the docs. Tier 1 is therefore advertised per our registry and must be narrowed by a runtime capability probe before GA (see STATUS → Next actions). Prices were not captured; cost estimates report `estimated: false` until filled.

## Consequences

- Swapping a model = config change. Adding a provider = one adapter + config, no app changes.
- The AI evaluation harness (`REGRESSION_CASES` in translation-core) must run before any slot change.
