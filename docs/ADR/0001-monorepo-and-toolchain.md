# ADR-0001: Monorepo layout and toolchain

**Status:** accepted · 2026-09-04

## Context

One product, several runtimes (Fastify API, Next.js web, Flutter mobile) sharing domain rules, API contracts, translation logic and localization. The spec asks for a modular monolith first and clean seams for later extraction.

## Decision

- **pnpm workspaces + Turborepo** for task orchestration. Flutter lives in `apps/mobile` and is driven by its own toolchain (CI job `mobile`).
- **TypeScript 5.9 (strict)**, not TypeScript 7.x: the 7.x line is the native-port preview and tooling support (vitest, Next, typescript-eslint) is not yet uniform. Revisit when Next and typescript-eslint list 7.x as supported.
- **ESLint 10 flat config** with `typescript-eslint` strict + stylistic type-checked presets. `require-await` is disabled because Fastify's plugin idiom is `async` without `await`.
- **Vitest 4** everywhere. Integration tests for the API run against a real PostgreSQL (no mocks for SQL).
- Packages emit ESM to `dist/` via `tsconfig.build.json`; `tsconfig.json` (noEmit) covers tests for the editor and ESLint.
- `exactOptionalPropertyTypes` is on in packages and off only in `services/api` because Zod-inferred optionals (`string | undefined`) are the natural request shape there.

## Consequences

- One `pnpm install`, one `pnpm test`, one CI file. Cross-package types flow through built `dist/` outputs (build packages before typechecking consumers).
- Flutter is not orchestrated by Turbo; `pnpm mobile:*` are thin shortcuts.
