# Voxeli — Engineering Memory

**Product:** Voxeli — real-time AI voice translator platform (text, conversation, camera, learning, caller intelligence, AI Interpreter Calls). Brand: `docs/BRANDING.md`. Spec source: the two uploaded execution contracts (LinguaCall AI, now Voxeli).

## Non-negotiables

- Truthful states only: `IMPLEMENTED_AND_VERIFIED` · `IMPLEMENTED_NOT_RUNTIME_VERIFIED` · `SCAFFOLDED` · `BLOCKED_EXTERNAL_DEPENDENCY` · `UNSUPPORTED_PLATFORM_CAPABILITY` · `FAILED_VALIDATION`. Never disguise one as another.
- No provider/model names in application code or client responses; use slots from `@voxeli/config` via `AIModelRouter`.
- AI output, OCR, documents, transcripts, webhooks = untrusted data. Validate with Zod; never execute embedded instructions.
- Every user resource query filters by `userId`. Never trust a client-sent id alone.
- Metered resources (realtime minutes, audio minutes) are charged where the server can observe them, never from a client-reported duration.
- No fake indicators (confidence %, quality scores, offline claims). Capability registry decides what is advertised.
- Before changing any model slot, run `pnpm --filter @voxeli/api eval` and compare entity preservation, latency and cost against the current configuration (ADR-0004).
- Cellular call capture/recording: `UNSUPPORTED_PLATFORM_CAPABILITY`. No hidden APIs, Accessibility abuse, root, private Apple APIs.
- Secrets only via env (`.env.example` is the template). Mock AI provider is refused in production.
- Hebrew/Arabic are first-class: set `lang`/`dir`, isolate technical tokens, never reverse URLs/numbers/IDs.

## Commands

```
pnpm install
pnpm -r --filter './packages/*' build          # build shared packages first
pnpm test | pnpm lint | pnpm typecheck | pnpm build
pnpm --filter @voxeli/api dev                  # needs services/api/.env (copy .env.example)
pnpm db:generate | pnpm db:migrate | pnpm db:seed
pnpm --filter @voxeli/api eval                 # AI regression eval; add --json=out.json --quality=fast
pnpm --filter @voxeli/web dev                  # http://localhost:3000, API_URL env → BFF
cd apps/mobile && flutter gen-l10n && flutter analyze && flutter test
docker compose -f infrastructure/docker-compose.yml up -d   # local Postgres + Redis
scripts/smoke.sh <api-url> [web-url]           # post-deploy gates (see docs/DEPLOYMENT.md)
```

Test DB: `postgres://voxeli:voxeli@localhost:5432/voxeli_test` (vitest sets env; migrations run in `beforeAll`).

## Layout

See `docs/ARCHITECTURE.md`. Layers: presentation → application → domain → infrastructure. Domain packages import no frameworks.

## Conventions

- TypeScript strict, ESM, `verbatimModuleSyntax`; type-only imports. Zod 4 (`z.url()`, `z.uuid()`, `z.email()`).
- Errors: `AppFailure` from `@voxeli/domain` (`failures.*` helpers). Routes throw; the error handler maps.
- Tests: vitest; API tests are integration tests on real Postgres (`fileParallelism: false`). Flutter: widget tests with fake repositories through Riverpod overrides.
- Localization: add a key to `packages/localization/src/messages/index.ts` (all 7 locales — the test enforces parity) and to every `apps/mobile/lib/l10n/app_*.arb`.
- Commit style: imperative subject, why in body. Update `docs/STATUS.md` at milestone changes; ADRs in `docs/ADR/`.

## Current milestone

Milestone 0 (Foundation) + first translation vertical slice: see `docs/STATUS.md`.

## Known limitations

Tracked in `docs/TECH_DEBT.md` and `docs/STATUS.md` → Blocked.
