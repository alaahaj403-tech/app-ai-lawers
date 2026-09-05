# syntax=docker/dockerfile:1.7
# Voxeli API — multi-stage build. Produces a small runtime image that contains
# only the API's production dependencies and compiled output.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

# ---- deps: resolve the whole workspace once (cached by lockfile) -------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY packages/domain/package.json packages/domain/
COPY packages/config/package.json packages/config/
COPY packages/api-contracts/package.json packages/api-contracts/
COPY packages/ai-core/package.json packages/ai-core/
COPY packages/translation-core/package.json packages/translation-core/
COPY packages/realtime-core/package.json packages/realtime-core/
COPY packages/localization/package.json packages/localization/
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- build: compile shared packages and the API --------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY services/api ./services/api
RUN pnpm -r --filter './packages/*' build && pnpm --filter @voxeli/api build
# Prune to the API's production dependency graph, with workspace packages inlined.
RUN pnpm --filter @voxeli/api deploy --prod --legacy /out

# ---- runtime -------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system voxeli && useradd --system --gid voxeli --home /app voxeli
WORKDIR /app
COPY --from=build --chown=voxeli:voxeli /out ./
COPY --from=build --chown=voxeli:voxeli /repo/services/api/drizzle ./drizzle
USER voxeli
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/health || exit 1
# Migrations run as an explicit release step (see docs/DEPLOYMENT.md), not on boot.
CMD ["node", "dist/index.js"]
