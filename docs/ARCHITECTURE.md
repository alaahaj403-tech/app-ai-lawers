# Voxeli — Architecture

```
apps/
  web/        Next.js 16 (App Router) — translator UI, BFF, RTL-first
  mobile/     Flutter 3.47 — translator screen, secure auth, 7 UI locales
services/
  api/        Fastify 5 modular monolith — auth · translate · realtime · flags · usage · audit
packages/
  domain/            languages, translation modes/results, typed failures, capability matrix, plans
  api-contracts/     Zod schemas shared by API and clients
  config/            env validation, server-controlled model slots
  ai-core/           provider interfaces, AIModelRouter, circuit breaker, cost estimate, OpenAI + mock adapters
  translation-core/  TranslationService: protected entities → structured prompt → route → verify → repair
  realtime-core/     streaming pipeline: sources, segmenter, echo guard, ledger, latency meter
  localization/      message catalogs (en/he/ar/de/ru/fr/es), ICU-style plurals, bidi helpers
infrastructure/      docker-compose for local Postgres/Redis
docs/                ADRs, STATUS, TECH_DEBT, compliance, branding
```

## Layers

`presentation` (web/mobile) → `application` (API routes/services) → `domain` (packages/domain, translation-core, realtime-core) → `infrastructure` (drizzle repositories, provider adapters). Domain packages have no framework or provider imports.

## Request path — text translation (first vertical slice)

1. Client → `POST /v1/translate` (Zod-validated, ≤5,000 chars, idempotency key optional).
2. Quotas reserved atomically (`translations`, `characters`); refunded if the provider fails.
3. `TranslationService`: extract protected entities → build policy/data-separated prompt → `AIModelRouter.translate` (slot by plan/quality, failover, timeout) → verify entities → one repair pass if corrupted.
4. Persist (unless no-history) → respond with result, routing (slot, degraded, latency — never provider names), quota state.
5. `ai_usage` row per provider attempt (cost/latency/success/fallback).

## Realtime path

`POST /v1/realtime/sessions` → flag + quota + tier selection → ephemeral client secret → client connects directly (WebRTC/WS) → `POST …/metrics` at end. See ADR-0005.

## Security baseline in code (not only docs)

Argon2id · rotating refresh tokens (hashed) · HS256 with rotation · per-route + per-query authorization · rate limiting (Redis-backed optional) · Helmet · CORS allow-list · 64 KB body limit · Zod on every input · typed errors without stack traces · audit log · secrets only via env (validated at boot; mock AI refused in production) · BFF cookies for web.

## Observability

Pino structured logs with redaction of auth headers/passwords/text; `x-correlation-id` per request, propagated to providers and usage rows; `/health` and `/ready` (DB probe + provider circuit snapshot).
