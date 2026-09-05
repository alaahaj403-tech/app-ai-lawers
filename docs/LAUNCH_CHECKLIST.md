# Launch Checklist

States follow `CLAUDE.md`: **VERIFIED** (executed here), **IMPLEMENTED** (code + tests, not run in the target environment), **BLOCKED** (needs something outside this repository), **NOT STARTED**.

## Engineering gates

| Gate                                                                                         | State                                       | Evidence / what is missing                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| P0 defects                                                                                   | VERIFIED 0 open                             | test suites green: packages 81 · API 39 · web 6 · Flutter 6                          |
| Migrations apply to an empty DB and to the previous schema                                   | VERIFIED                                    | `0000` + `0001` applied in tests; forward-only                                       |
| Secrets externalized, mock provider refused in production                                    | VERIFIED                                    | `validateServerEnv` tests                                                            |
| Auth: argon2id, rotating refresh, revocation, rate limit on credential endpoints             | VERIFIED                                    | auth tests incl. limiter burst test                                                  |
| Email verification, password reset (no enumeration), account deletion (cascade), data export | VERIFIED (API) · IMPLEMENTED (web pages)    | `account.test.ts`; web `/verify-email`, `/reset-password` built, not clicked through |
| Ownership on every user resource                                                             | VERIFIED                                    | IDOR tests on translations, realtime sessions, relay                                 |
| Realtime minutes metered server-side (Tier 2)                                                | VERIFIED                                    | relay tests over WebSocket                                                           |
| Tier-1 credential bounded by remaining minutes                                               | VERIFIED                                    | test                                                                                 |
| Provider/model names never reach clients                                                     | VERIFIED                                    | assertion in translate test                                                          |
| Docker images build and boot                                                                 | IMPLEMENTED                                 | CI job `images`; no Docker daemon in this environment                                |
| Real AI provider path exercised                                                              | BLOCKED                                     | needs `OPENAI_API_KEY` in the environment → `pnpm --filter @voxeli/api eval`         |
| Android APK compiles                                                                         | see STATUS (in progress at time of writing) | `flutter build apk --debug` with SDK 37                                              |
| iOS build                                                                                    | BLOCKED                                     | requires macOS/Xcode                                                                 |
| Physical-device tests (mic, Bluetooth, RTL on device)                                        | BLOCKED                                     | devices                                                                              |
| Performance budgets measured                                                                 | BLOCKED                                     | needs live provider; instrumentation exists                                          |

## Product gates before store submission

| Item                                                       | State                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| Privacy policy + terms (he/ar/en) hosted at `APP_BASE_URL` | NOT STARTED — legal text is outside this repo            |
| Store listing copy, screenshots, icon (`docs/BRANDING.md`) | NOT STARTED — assets                                     |
| Data-safety / privacy-nutrition declarations               | NOT STARTED — derive from `docs/APP_STORE_COMPLIANCE.md` |
| Domain (`voxeli.app`), DNS, TLS                            | BLOCKED — registration is a founder action               |
| Resend sender domain verified (SPF/DKIM)                   | BLOCKED — DNS                                            |
| OpenAI spend limit set                                     | BLOCKED — founder action, do before the first live eval  |
| Talk screen (mobile client for the relay)                  | NOT STARTED — next engineering item                      |

## Go / no-go

Go for a **closed beta of text translation + web Listen** once the BLOCKED rows in the engineering table that only need a key or a domain are cleared and CI's image job is green. **No-go for public store release** until the product gates are done and the realtime client exists; shipping the store listing with "live interpreter" claims before that would violate the no-fake-capabilities rule.
