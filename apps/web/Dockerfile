# syntax=docker/dockerfile:1.7
# Voxeli web — Next.js standalone output behind the BFF. The API URL is a
# server-side runtime variable; nothing secret is baked into the image.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

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

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm -r --filter './packages/*' build && pnpm --filter @voxeli/web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system voxeli && useradd --system --gid voxeli --home /app voxeli
WORKDIR /app
COPY --from=build --chown=voxeli:voxeli /repo/apps/web/.next/standalone ./
COPY --from=build --chown=voxeli:voxeli /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=voxeli:voxeli /repo/apps/web/public ./apps/web/public
USER voxeli
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
