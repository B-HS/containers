FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/engine-agent/package.json apps/engine-agent/package.json
COPY apps/traffic-worker/package.json apps/traffic-worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db-schema/package.json packages/db-schema/package.json
RUN bun install --frozen-lockfile

COPY apps/traffic-worker apps/traffic-worker
COPY packages/config packages/config
COPY packages/contracts packages/contracts
RUN bun run --filter @containers/traffic-worker build

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0

WORKDIR /app
COPY --from=build --chown=bun:bun /app/apps/traffic-worker/dist ./dist
RUN mkdir -p /backups /credentials /data
RUN chown bun:bun /backups /credentials /data

USER bun
EXPOSE 3003

CMD ["bun", "dist/server.js"]
