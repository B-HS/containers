# Containers

A self-hosted Docker management panel that runs entirely on your own machine — a modern alternative to Portainer / Yacht for a single Docker host, hardened as if it were a production control plane.

![Dashboard](screenshots/hero.png)

It lets you control Docker containers, create and deploy them, inspect live traffic, and manage the Nginx reverse proxy (including a GUI config editor) — all through a single web panel on your own machine. It ships with role-based access control, encrypted credentials, automated backups, and rate limiting, so it behaves like a small production control plane rather than an admin toy.

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
