# infrastructure — Docker Compose for the Life Tracker services

Everything needed to run the project's services in containers, so the host only needs Docker.
Today it runs the API (`../api`) and PostgreSQL. The web (`../web`) and mobile (`../mobile`) clients
will be added here later, so all services can be started from this one file.

## Contents

```
infrastructure/
├── docker-compose.yml   # All services, grouped by profile
├── .env                 # Your settings for the prod profile (gitignored, create it yourself)
└── data/                # SQLite database of the `dev` profile (gitignored, created on first run)
```

Related files outside this folder:

- [`../api/Dockerfile`](../api/Dockerfile): API image (Python 3.12, dependencies in `/opt/venv`, non-root user `app`)
- [`../api/docker-entrypoint.sh`](../api/docker-entrypoint.sh): runs `migrate` / `collectstatic` before the command,
  controlled by `DJANGO_MIGRATE=1` and `DJANGO_COLLECTSTATIC=1`
- [`../api/.dockerignore`](../api/.dockerignore): keeps `.env`, local databases and caches out of the image

The build context is the **`api/` folder** (it has the `Dockerfile` and `pyproject.toml`).

## Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine + Compose v2 (Linux), running
- Commands use `docker compose` (with a space)

## Profiles

Nothing starts without `--profile`.

| Profile | Services | URL | Database | Code | Use it for |
|---|---|---|---|---|---|
| `dev` | `api-dev` | http://localhost:8000 | SQLite in `infrastructure/data/` | mounted, auto-reload | Everyday development |
| `dev-pg` | `api-dev-pg`, `db` | http://localhost:8001 | PostgreSQL 16 on `localhost:5432` | mounted, auto-reload | Checking against Postgres |
| `prod` | `api-prod`, `db` | http://localhost:8002 | PostgreSQL 16 | baked into the image | Production-like run (gunicorn, `DEBUG=0`) |

All profiles apply migrations automatically on start. `prod` also runs `collectstatic`, and WhiteNoise
serves the static files (admin CSS/JS).

Rebuild (`--build`) after changing `pyproject.toml`, the `Dockerfile` or the entrypoint. In `dev` /
`dev-pg`, Python code changes don't need a rebuild.

## Starting the API

From this folder (`cd infrastructure`):

```bash
docker compose --profile dev up -d --build
docker compose --profile dev ps                 # STATUS should become "healthy" after ~20 s
docker compose --profile dev exec api-dev python manage.py createsuperuser
```

Then open http://localhost:8000/api/docs/.

Day to day:

```bash
docker compose --profile dev logs -f api-dev
docker compose --profile dev exec api-dev python manage.py test
docker compose --profile dev exec api-dev python manage.py makemigrations
docker compose --profile dev exec api-dev python manage.py shell
docker compose --profile dev down
```

For PostgreSQL replace `--profile dev` with `--profile dev-pg` and `api-dev` with `api-dev-pg`.

### prod profile

```bash
# first create infrastructure/.env (see Configuration below)
docker compose --profile prod up -d --build
docker compose --profile prod exec api-prod python manage.py createsuperuser
```

Without `SECRET_KEY` the container refuses to start (Django error in `docker compose logs api-prod`).
Keep `127.0.0.1` in `ALLOWED_HOSTS`, because the container health check calls the API on that address.
This profile is for running the built image locally. Real deployment (HTTPS, reverse proxy, backups) is
not set up yet.

## Configuration

- `dev` / `dev-pg`: variables are in `docker-compose.yml` (`x-api-dev-env`) and work without any `.env`.
- `prod`: reads `infrastructure/.env` (Compose loads it automatically for `${...}` values):

  | Variable | Required | Default |
  |---|---|---|
  | `SECRET_KEY` | yes | none, the container won't start without it |
  | `ALLOWED_HOSTS` | no | `localhost,127.0.0.1` (keep `127.0.0.1`, the health check uses it) |
  | `CORS_ALLOWED_ORIGINS` | no | `http://localhost:3000` |
  | `POSTGRES_PASSWORD` | no | `postgres` (also used by `dev-pg`) |
  | `EMAIL_URL` | no | `consolemail://` (emails printed to the container log) |
  | `DEFAULT_FROM_EMAIL` | no | `Life Tracker <noreply@localhost>` |
  | `PASSWORD_RESET_URL` | no | `http://localhost:3000/reset-password?uid={uid}&token={token}` |
- The full list of API variables and their defaults: [`../api/README.md`](../api/README.md#configuration).

`CORS_ALLOWED_ORIGINS` in dev already allows `localhost:3000` (future web dev server) and `localhost:8081`
(future Expo dev server).

## Resetting data

```bash
docker compose --profile dev down
rm data/db.sqlite3                          # dev: delete the SQLite database
docker compose --profile dev-pg down -v     # dev-pg/prod: -v deletes the postgres_data, media and static volumes
```

Both permanently delete all local data.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `port is already allocated` | Something else uses 8000/8001/8002/5432. Stop it, or change the left side of `ports:` |
| `api-dev` restarts or is `unhealthy` | `docker compose --profile dev logs api-dev`; usually a migration or settings error |
| `/usr/bin/env: 'sh\r'` or `exec format error` | `docker-entrypoint.sh` got Windows line endings; `.gitattributes` forces LF, re-checkout the file |
| Changes in `pyproject.toml` not picked up | Rebuild: `up -d --build` |
