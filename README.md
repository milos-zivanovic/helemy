# Helemy

Personal finance, fitness and nutrition tracker. One REST API serves a web client and a mobile app.

| Part | Folder | Status | Details |
|---|---|---|---|
| REST API (Django + DRF) | [`api/`](api/) | Working | [api/README.md](api/README.md) |
| Docker Compose | [`infrastructure/`](infrastructure/) | Working locally (dev and prod profiles); production live at https://helemy.com (Cloud Run + Supabase + Cloudflare) | [infrastructure/README.md](infrastructure/README.md), [DEPLOYMENT.md](infrastructure/DEPLOYMENT.md) |
| Web client (React + TypeScript, Vite) | [`web/`](web/) | Working (auth, household, finances, fitness, nutrition, Docker) | [web/README.md](web/README.md) |
| Mobile app (Expo / React Native) | [`mobile/`](mobile/) | Planned | [mobile/README.md](mobile/README.md) |

## Project structure

```
helemy/
├── api/                    # Django REST API (users, finances, fitness, nutrition); has its own pyproject.toml
├── infrastructure/         # docker-compose.yml with dev / dev-pg / prod profiles
├── web/                    # React + TypeScript web client (Vite)
├── mobile/                 # Future Expo mobile app
├── branding/               # Master logo (logo.png); web and mobile icons are made from it
├── .gitattributes          # Forces LF line endings for files that run inside Linux containers
└── CLAUDE.md               # Instructions for Claude Code
```

## Prerequisites

- **Docker Desktop** (Windows/macOS) or Docker Engine + Compose v2: enough to run the API
- **Node.js LTS**: only for web and mobile development
- **Python 3.12+**: optional, for running tests and tools on the host

## Starting the services with Docker

All Compose commands run from `infrastructure/`. Docker Desktop must be running.

### API

```bash
cd infrastructure
docker compose --profile dev up -d --build                    # API on http://localhost:8000, migrates automatically
docker compose --profile dev exec api-dev python manage.py createsuperuser
```

The same command starts the web client too (next section). Then open http://localhost:8000/api/docs/.
To use PostgreSQL instead of SQLite, use `--profile dev-pg` and the service `api-dev-pg` (API on port 8001,
web `web-dev-pg` on 3000); `--profile prod` runs a production-like build, web and API behind nginx on port 8080.
Profiles, the prod setup, data reset and troubleshooting:
[infrastructure/README.md](infrastructure/README.md).

### Web

The `dev` profile also starts `web-dev`, the Vite dev server with hot reload:

```bash
cd infrastructure
docker compose --profile dev up -d --build    # API on :8000, web on http://localhost:3000
```

To run the web dev server on the host instead (`npm run dev`, see [web/README.md](web/README.md)), start
only the API, because both use port 3000:

```bash
docker compose --profile dev up -d api-dev    # API only, no web-dev
```

### Mobile (once `mobile/` exists)

The mobile app is **not** meant to run in Docker: the phone or emulator must reach the Expo dev server
directly, which is simplest from the host. Start the API with Docker as above, then on the host:

```bash
cd mobile
npx expo start
```

Reasons and configuration: [mobile/README.md](mobile/README.md).

### Stopping

```bash
cd infrastructure
docker compose --profile dev down
```

## API at a glance

| URL | What |
|---|---|
| http://localhost:8000/api/docs/ | Swagger UI (try requests in the browser) |
| http://localhost:8000/api/schema/ | OpenAPI schema (import into Postman) |
| http://localhost:8000/admin/ | Django admin |
| `/api/auth/register/` | Sign up, returns the user and JWT tokens |
| `/api/auth/token/` | Login with `email` + `password`, returns JWT tokens |
| `/api/finances/`, `/api/fitness/`, `/api/nutrition/` | Domain endpoints |

All data is isolated per household; see [api/README.md](api/README.md#data-isolation-important).

## Tests

```bash
cd infrastructure
docker compose --profile dev exec api-dev python manage.py test
```

Or on the host: `cd api && python manage.py test` (needs `pip install ".[dev]"` from `api/` in a Python 3.12+ venv).

Web unit tests and the end-to-end smoke test: see [web/README.md](web/README.md#tests).

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `master` and every pull
request (GitHub Actions, results in the repository's **Actions** tab). Four jobs run in parallel:

| Job      | What it checks                                                                              |
| -------- | ------------------------------------------------------------------------------------------- |
| `api`    | Ruff format and lint, no missing migrations, OpenAPI schema valid and warning-free, tests on PostgreSQL 16 (as in production) |
| `web`    | Prettier, TypeScript, oxlint, Vitest unit tests, production build                           |
| `e2e`    | `web/src/api/schema.d.ts` matches the API (`npm run gen:api` was not forgotten), Playwright smoke test |
| `docker` | The API image and the web `prod` image build                                                |

On an e2e failure the run's page has a `playwright-results` artifact with the screenshot and the trace
(`npx playwright show-trace trace.zip`). The workflow has read-only access to the repository and needs
no secrets.

Two more workflows belong to production ([infrastructure/DEPLOYMENT.md](infrastructure/DEPLOYMENT.md)):
[`deploy.yml`](.github/workflows/deploy.yml) deploys the API to Cloud Run after CI passes on `master`, and
[`backup.yml`](.github/workflows/backup.yml) dumps the production database into R2 every week.

## License

Proprietary, all rights reserved: the code is public for viewing only, no use, copying or
distribution without written permission. See [LICENSE](LICENSE).
