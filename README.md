# Life Tracker

Personal finance, fitness, and nutrition tracking API built with Django REST Framework.

## Stack

- **Backend**: Django 5.0 + DRF + SimpleJWT
- **Database**: PostgreSQL 16 (production profile) / SQLite (dev profile)
- **API Docs**: drf-spectacular (OpenAPI 3.0 / Swagger UI)
- **Containerization**: Docker + Docker Compose
- **Code Quality**: Black + Ruff

## Project Structure

```
life_tracker/
├── api/                    # Django REST API
│   ├── life_tracker/       # Project settings
│   ├── users/              # Users, households, memberships
│   ├── finances/           # Transactions, categories, budgets
│   ├── fitness/            # Exercises, trainings, sets
│   ├── nutrition/          # Foods, consumptions, goals
│   ├── common/             # Shared permissions, mixins, pagination
│   ├── manage.py
│   └── Dockerfile
├── web/                    # Future: HTMX/React web client
├── mobile/                 # Future: React Native (Expo) mobile app
├── infrastructure/         # Docker Compose, Caddy, scripts
└── docs/                   # Documentation
```

## Prerequisites

- Docker & Docker Compose (Docker Desktop on Windows/macOS)

Python does **not** need to be installed on the host — it runs inside the container (`python:3.12-slim`).

> **Windows note:** Docker Desktop ships Compose v2, invoked as `docker compose` (space).

## Quick Start (Docker)

All commands run from `infrastructure/`:

```bash
cd infrastructure

# Start development environment with SQLite (API on port 8000)
docker compose --profile dev up -d

# Or with PostgreSQL 16 (API on port 8001, db on 5432)
docker compose --profile dev-pg up -d

# Run migrations
docker compose --profile dev exec api-dev python manage.py migrate

# Create admin user
docker compose --profile dev exec api-dev python manage.py createsuperuser

# View logs
docker compose logs -f

# Stop containers
docker compose down
```

### Access

- API: http://localhost:8000 (port 8001 with the `dev-pg` profile)
- Swagger UI: http://localhost:8000/api/docs/
- ReDoc: http://localhost:8000/api/redoc/
- OpenAPI Schema: http://localhost:8000/api/schema/
- Admin: http://localhost:8000/admin/

The browsable API is also available at each endpoint when accessed via browser.

Main endpoint groups:

- **Authentication** — `/api/v1/auth/`
- **Users & Households** — `/api/v1/auth/households/`, `/api/v1/auth/me/`
- **Finances** — `/api/v1/finances/`
- **Fitness** — `/api/v1/fitness/`
- **Nutrition** — `/api/v1/nutrition/`

## Docker Compose Profiles

| Profile  | Services               | Description                    |
|----------|------------------------|--------------------------------|
| `dev`    | `api-dev`              | SQLite, port 8000              |
| `dev-pg` | `api-dev-pg`, `db`     | PostgreSQL 16, port 8001       |
| `prod`   | `api-prod`, `db`       | Gunicorn + PostgreSQL          |

All Django management commands run inside the container, e.g.:

```bash
docker compose --profile dev exec api-dev python manage.py shell
docker compose --profile dev exec api-dev python manage.py makemigrations
docker compose --profile dev exec api-dev python manage.py spectacular --file schema.yml
```

## Environment Variables

Development defaults are set in `infrastructure/docker-compose.yml` (`DEBUG=1`, SQLite/Postgres `DATABASE_URL`, `SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`). Override them by editing the compose file or by creating `api/.env` (read automatically by django-environ).

Key variables:

- `DEBUG` — Enable debug mode (1/0)
- `SECRET_KEY` — Django secret key
- `DATABASE_URL` — Database connection string
- `ALLOWED_HOSTS` — Comma-separated allowed hosts
- `CORS_ALLOWED_ORIGINS` — Comma-separated CORS origins
- `JWT_ACCESS_TOKEN_LIFETIME_MINUTES`, `JWT_REFRESH_TOKEN_LIFETIME_DAYS` — JWT settings

## Code Quality (optional, runs on host)

These are not required to run the app in Docker; they need a local Python 3.12+ environment (run from `api/`):

```bash
ruff check .
black .
```

## License

MIT
