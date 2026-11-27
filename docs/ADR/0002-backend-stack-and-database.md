# ADR-0002: Backend stack, database and migrations

**Status:** accepted · 2026-09-04

## Decision

- **Node 22 + Fastify 5** modular monolith (`services/api`), modules: auth, translation, realtime, flags, usage, audit, health.
- **PostgreSQL 16 as source of truth** via **Drizzle ORM 0.45** with **generated SQL migrations** (`drizzle-kit generate` → `drizzle/*.sql`, applied by `src/db/migrate.ts`). No runtime schema sync.
- **Zod 4** validates every external input at the route boundary; `@voxeli/api-contracts` is the single source for request/response shapes shared with web and (by mirror) mobile.
- **Redis** is optional: when `REDIS_URL` is set, `@fastify/rate-limit` uses it so limits hold across instances.
- Typed failures (`AppFailure`) are the only error shape crossing modules; the error handler maps them to HTTP with a correlation id and never leaks internals.

## Options considered

- NestJS: more ceremony than the domain needs today. Prisma: heavier runtime and slower cold starts; Drizzle keeps SQL visible and migrations reviewable. Express: no schema-based plugin encapsulation.

## Consequences

- Every table with user data has `user_id` and every repository method filters by it (no id-only lookups). Verified by IDOR tests.
- `jsonb` is used only for structurally non-relational payloads (translation details, session metrics, audit metadata).
