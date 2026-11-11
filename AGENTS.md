# life_tracker — Django REST API for personal finance, fitness, and nutrition tracking

## Stack
- Python / Django 5.0, SQLite locally, Postgres in production (decided by `DEBUG` in `api/life_tracker/settings.py`)
- Django REST Framework, SimpleJWT, django-filter, drf-spectacular, django-cors-headers, django-environ
- Apps: `users`, `finances`, `fitness`, `nutrition`, `common`
- Auth: JWT (SimpleJWT) with access/refresh tokens, rotation, blacklist
- Multi-tenancy: Household-based isolation with roles (Owner/Admin/Member/Viewer)

## Run locally (Docker)
```bash
cd infrastructure
docker-compose --profile dev up -d          # SQLite
docker-compose --profile dev-pg up -d       # PostgreSQL
docker-compose --profile dev exec api-dev python manage.py migrate
docker-compose --profile dev exec api-dev python manage.py createsuperuser
```
- API: http://localhost:8000
- Swagger UI: http://localhost:8000/api/docs/
- Admin: http://localhost:8000/admin/

## Run locally (Python)
```bash
cd api
python -m venv venv
source venv/bin/activate  # or venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

## Commands (via Docker Compose, run from `infrastructure/`)
- `docker compose --profile dev up -d` / `--profile dev-pg up -d` — Start Docker dev environment (SQLite / PostgreSQL)
- `docker compose --profile dev exec api-dev python manage.py migrate` — Run migrations
- `docker compose --profile dev exec api-dev python manage.py makemigrations` — Create migrations
- `docker compose --profile dev exec api-dev python manage.py createsuperuser` — Create admin user
- `docker compose --profile dev exec api-dev python manage.py shell` — Django shell
- `docker compose logs -f` / `docker compose down` — Logs / stop containers
- `cd api && ruff check .` / `black .` — Lint / format (host, optional)

## Conventions
- TIME_ZONE `Europe/Belgrade`, LANGUAGE_CODE `en-us`, `USE_TZ = True`
- Settings in `api/life_tracker/settings.py`; secrets from env vars (`.env`)
- All ViewSets use `HouseholdMixin` for automatic household isolation
- Permissions: `IsHouseholdMember` on all domain endpoints
- Pagination: Standard (50) / Small (20) with metadata
- API versioning: `/api/v1/` prefix

## Notes
- `DEBUG=1` and fallback `SECRET_KEY` in `.env.example` — fine locally, use real secrets in production
- `ALLOWED_HOSTS` configured via env
- Database: SQLite for local dev, PostgreSQL 16 for production
- Migrations live per-app in `<app>/migrations/`