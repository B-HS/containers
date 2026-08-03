# Containers

A self-hosted Docker management panel that runs entirely on your own machine — a modern alternative to Portainer / Yacht for a single Docker host, hardened as if it were a production control plane.

![Dashboard](screenshots/hero.png)

## What it does

- **Container control** — start/stop/restart/kill, create with resource limits, interactive terminal (WebSocket), logs, stats, top, and exec
- **Nginx as code** — inspect and edit the live `nginx.conf` with a **GUI editor** (directive tooltips, server/location master-detail sidebar) or raw text, with `nginx -t` validation and atomic rollback on reload
- **Deployments** — upload an OCI/Docker archive, define a manifest (image, secrets, health check, rollout), and blue-green release through the reverse proxy
- **Registry** — authenticated image pull with encrypted credentials
- **Traffic analytics** — real-time request log ingestion, p50/p95/p99, top paths, CSV/NDJSON export
- **Backup & restore** — scheduled SQLite snapshots with integrity verification and rollback
- **Security** — owner/admin/operator roles, API keys with scoped access, recent-login step-up on destructive ops, rate limiting, audit log, and a hard management-plane boundary between the control plane and user workloads

## Tech stack

Bun · Next.js (App Router) · Hono · Drizzle ORM + SQLite · Better Auth · Docker Engine API · Nginx

## Requirements

- macOS (Apple Silicon) or Linux
- Docker Desktop / Docker Engine with Compose v2.24+
- [Bun](https://bun.sh) (for local development only — runtime uses Docker images)

## Run it

The recommended way on macOS is the interactive setup script:

```bash
./scripts/setup-macos.sh
```

It checks the environment, verifies the Compose file, optionally builds, starts the stack, and runs a smoke test. It creates a `compose.override.yaml` for customization (panel port, backup interval/retention, traffic retention).

To run manually:

```bash
docker compose build
docker compose up -d --wait
```

Then open **http://127.0.0.1:8080**. On first boot, bootstrap the owner account from the panel.

Customization via environment (or `compose.override.yaml`):

| Variable                     | Default | Purpose                   |
| ---------------------------- | ------- | ------------------------- |
| `PANEL_PORT`                 | `8080`  | Panel host port           |
| `BACKUP_INTERVAL_HOURS`      | `24`    | Automatic backup interval |
| `BACKUP_RETENTION_COUNT`     | `7`     | Backups kept              |
| `TRAFFIC_RAW_RETENTION_DAYS` | `14`    | Raw traffic log retention |

## Development

```bash
bun install
bun run dev        # run all workspaces
bun run typecheck  # typecheck all workspaces
bun run lint
bun test           # unit + integration tests
bun run build
```

## Project layout

```
apps/
  api/            Hono control-plane API + DB + auth
  engine-agent/   Docker Engine API client, exec, streams, nginx apply
  traffic-worker/ access-log ingestion, analytics, export
  web/            Next.js panel
packages/
  contracts/      shared Zod schemas / RPC types
  db-schema/      Drizzle schema + migrations
  config/         env + secret loading
infra/nginx/      edge nginx (rate limits, security headers)
```

Documentation lives in [`docs/`](docs/README.md).
