# Life Tracker

Personal finance, fitness and nutrition tracker. One REST API serves a web client and a mobile app.

| Part | Folder | Status | Details |
|---|---|---|---|
| REST API (Django + DRF) | [`api/`](api/) | Working | [api/README.md](api/README.md) |
| Docker Compose | [`infrastructure/`](infrastructure/) | Working for development | [infrastructure/README.md](infrastructure/README.md) |
| Web client (React + TypeScript, Vite) | [`web/`](web/) | In progress (phase 0) | [web/README.md](web/README.md) |
| Mobile app (Expo / React Native) | [`mobile/`](mobile/) | Planned | [mobile/README.md](mobile/README.md) |

## Project structure

```
life_tracker/
├── api/                    # Django REST API (users, finances, fitness, nutrition); has its own pyproject.toml
├── infrastructure/         # docker-compose.yml with dev / dev-pg / prod profiles
├── web/                    # React + TypeScript web client (Vite)
├── mobile/                 # Future Expo mobile app
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

Then open http://localhost:8000/api/docs/. To use PostgreSQL instead of SQLite, use `--profile dev-pg` and
the service `api-dev-pg` (API on port 8001); `--profile prod` runs a production-like build on port 8002.
Profiles, the prod setup, data reset and troubleshooting:
[infrastructure/README.md](infrastructure/README.md).

### Web (once `web/` exists)

The plan is a `web-dev` service in the same `dev` profile, so one command starts API and web together:

```bash
cd infrastructure
docker compose --profile dev up -d --build    # API on :8000, web on :3000
```

Until that service is added, run the web dev server on the host as described in
[web/README.md](web/README.md).

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

## License

MIT
