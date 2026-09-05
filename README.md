# Voxeli — AI Voice Translator

_Speak freely. Understand everyone._

Voxeli is a multilingual AI communication platform: natural translation, real-time voice conversation, camera translation, language learning from real conversations, caller intelligence and — the flagship — **AI Interpreter Calls** (you speak Hebrew, they hear English, and back).

This repository is a pnpm/Turborepo monorepo: Fastify API, Next.js web, Flutter mobile and shared TypeScript packages. Start with [`CLAUDE.md`](./CLAUDE.md) (engineering memory), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and [`docs/STATUS.md`](./docs/STATUS.md).

## Quick start

```bash
pnpm install
docker compose -f infrastructure/docker-compose.yml up -d
cp .env.example services/api/.env            # set JWT_SECRET (and OPENAI_API_KEY for real translations)
pnpm -r --filter './packages/*' build
pnpm db:migrate && pnpm db:seed
pnpm --filter @voxeli/api dev                # http://localhost:4000
API_URL=http://localhost:4000 pnpm --filter @voxeli/web dev   # http://localhost:3000
```

Without `OPENAI_API_KEY` the API runs with a clearly-labelled mock provider (never in production).

## Quality

`pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm build` · `cd apps/mobile && flutter test`. CI: `.github/workflows/ci.yml`.
