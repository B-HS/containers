FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/egress-broker/package.json apps/egress-broker/package.json
COPY apps/engine-agent/package.json apps/engine-agent/package.json
COPY apps/traffic-worker/package.json apps/traffic-worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db-schema/package.json packages/db-schema/package.json
COPY packages/nginx-config/package.json packages/nginx-config/package.json
RUN bun install --frozen-lockfile

COPY apps/api/src apps/api/src
COPY apps/web apps/web
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY packages/db-schema packages/db-schema
COPY packages/nginx-config packages/nginx-config
RUN bun run --filter @containers/web build

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0

WORKDIR /app
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=build --chown=bun:bun /app/apps/web/.next/standalone ./
COPY --from=build --chown=bun:bun /app/apps/web/.next/static ./apps/web/.next/static

USER bun
EXPOSE 3000

CMD ["bun", "apps/web/server.js"]
