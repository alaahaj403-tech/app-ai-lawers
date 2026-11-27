# Voxeli — Brand & Store Positioning

**Status:** adopted 2026-09-04. Product code name `LinguaCall AI` in the original specification is superseded by **Voxeli** everywhere user-facing. Internal package scope is `@voxeli/*`.

## Name

| Item                                | Value                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brand                               | **Voxeli**                                                                                                                                       |
| App Store / Google Play title       | **Voxeli — AI Voice Translator** (alt: _Voxeli: Live AI Translator_)                                                                             |
| Subtitle (iOS, ≤30 chars)           | _Live translation for calls & talk_                                                                                                              |
| Short description (Play, ≤80 chars) | _Real-time AI voice translator for calls, conversations, camera & 100+ languages._                                                               |
| Slogan                              | **Speak freely. Understand everyone.**                                                                                                           |
| Secondary lines                     | _You speak your language. They hear theirs._ · _Talk naturally. We handle the language._ · _Live AI Interpreter Calls_                           |
| Domains                             | `voxeli.ai`, `voxeli.app` (availability observed by the founder on 2026-09-04 — re-verify at registration time; not verified by this repository) |

### Why Voxeli (judgment)

- `Vox` reads as _voice_ across European languages; 6 letters; brandable; no country tie.
- Reads as an AI company, not a utility. Scales to sub-brands: **Voxeli Call**, **Voxeli Live**, **Voxeli Learn**, **Voxeli Lens**.
- Weakness: the name alone does not say "translator". Mitigation: title + subtitle carry the search terms; the icon carries a speech/waveform motif.

## Category and keyword strategy (store metadata)

Primary keyword cluster (title, subtitle, first 3 lines of description):
`AI translator` · `voice translator` · `live translation` · `AI interpreter` · `translate all languages` · `conversation mode` · `camera translate`

Feature vocabulary (consistent across app, store, web):
`AI Calls` · `Caller Intelligence` · `Meeting Translator` · `AI Interpreter` · `Language Learning` · `Voice Assistant`

Use-case pages: travel/tourism · business meetings · language learning · camera translate · live interpreter.

## Naming rules inside the product

- Feature names are fixed strings: **AI Interpreter Call**, **Live Recording Translator**, **Live Meeting Translator**, **Live Subtitles**, **Conversation Mode**, **Camera Translate**.
- Never describe a capability the capability registry does not confirm (no "offline" or "works on any phone call" claims). See `docs/APP_STORE_COMPLIANCE.md`.
- The brand word `Voxeli` is always LTR and never transliterated in Hebrew/Arabic UI; it is isolated with `unicode-bidi: isolate` (web) or `TextDirection.ltr` (Flutter).

## Visual direction (v1)

- One accent (`#2F5DD6`), warm off-white paper, near-black ink; dark theme derived from the same tokens.
- Typography: Inter for Latin, Heebo / Noto Sans Hebrew, Noto Sans Arabic — loaded with real fallbacks.
- No gradients-for-decoration, no glass cards. Hierarchy: language pair → text → one primary button → result.
- Icon motif: a speech bubble whose tail becomes a waveform. (Asset production pending — not in this repo yet.)
