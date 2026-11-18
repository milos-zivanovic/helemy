# infrastructure — Docker Compose for the Life Tracker services

Everything needed to run the project's services in containers, so the host only needs Docker.
It runs the API (`../api`), PostgreSQL and the web client (`../web`). The mobile app (`../mobile`) runs
on the host (see the root README).

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

- [`../web/Dockerfile`](../web/Dockerfile): web image, targets `dev` (Vite dev server) and `prod` (build
  served by nginx with [`../web/nginx.conf`](../web/nginx.conf))
- [`../web/.dockerignore`](../web/.dockerignore): keeps the host's `node_modules` and `dist` out of the image

The build contexts are the **`api/`** and **`web/`** folders (each has its own `Dockerfile`).

## Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine + Compose v2 (Linux), running
- Commands use `docker compose` (with a space)

## Profiles

Nothing starts without `--profile`.

| Profile | Services | URL | Database | Code | Use it for |
|---|---|---|---|---|---|
| `dev` | `api-dev`, `web-dev` | API http://localhost:8000, web http://localhost:3000 | SQLite in `infrastructure/data/` | mounted, auto-reload | Everyday development |
| `dev-pg` | `api-dev-pg`, `db` | http://localhost:8001 | PostgreSQL 16 on `localhost:5432` | mounted, auto-reload | Checking against Postgres |
| `prod` | `web-prod`, `api-prod`, `db` | http://localhost:8080 (web + API through nginx); API alone on 8002 | PostgreSQL 16 | baked into the image | Production-like run (nginx, gunicorn, `DEBUG=0`) |

All profiles apply migrations automatically on start. `prod` also runs `collectstatic`, and WhiteNoise
serves the static files (admin CSS/JS).

Rebuild (`--build`) after changing `pyproject.toml`, `package.json`, a `Dockerfile` or the entrypoint.
In `dev` / `dev-pg`, code changes (Python and web) don't need a rebuild. `web-dev` keeps its
`node_modules` in an anonymous volume, so after a `package.json` change add `-V` (fresh volumes):
`docker compose --profile dev up -d --build -V web-dev`.

`web-dev` watches files by polling (`WATCH_POLLING=1`), because a Windows bind mount doesn't pass file
change events into the container. It runs only in the `dev` profile; with `dev-pg` run the web on the host
with `VITE_API_URL=http://localhost:8001`.

## Starting the API

From this folder (`cd infrastructure`):

```bash
docker compose --profile dev up -d --build
docker compose --profile dev ps                 # STATUS should become "healthy" after ~20 s
docker compose --profile dev exec api-dev python manage.py createsuperuser
```

Then open the web app at http://localhost:3000 and the API docs at http://localhost:8000/api/docs/.

Day to day:

```bash
docker compose --profile dev logs -f api-dev
docker compose --profile dev logs -f web-dev
docker compose --profile dev up -d api-dev        # API only (when the web runs on the host with npm run dev)
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

Then open http://localhost:8080: nginx (`web-prod`) serves the built web app and forwards `/api/`,
`/admin/`, `/static/` and `/media/` to `api-prod`, so the browser sees one origin and needs no CORS.
`web-prod` waits until `api-prod` is healthy. Rebuild (`--build`) after any web or API code change: the
code is baked into the images.

Without `SECRET_KEY` the container refuses to start (Django error in `docker compose logs api-prod`).
Keep `127.0.0.1` in `ALLOWED_HOSTS`, because the container health check calls the API on that address.
This profile is for running the built images locally. Real deployment (HTTPS, a domain, backups) is not
set up yet.

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
  | `PASSWORD_RESET_URL` | no | `http://localhost:8080/reset-password?uid={uid}&token={token}` (the web app of this profile) |
- The full list of API variables and their defaults: [`../api/README.md`](../api/README.md#configuration).

`CORS_ALLOWED_ORIGINS` in dev allows `localhost:3000` (web dev server) and `localhost:8081` (future
Expo dev server). In prod the web goes through nginx on the same origin, so CORS only matters for a
client on another domain.

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
| `port is already allocated` | Something else uses 3000/8000/8001/8002/8080/5432 (e.g. `npm run dev` on the host takes 3000). Stop it, or change the left side of `ports:` |
| Web edits don't reload in `web-dev` | Check `WATCH_POLLING: "1"` on the service; `docker compose --profile dev logs web-dev` |
| `web-dev`: missing package or `Cannot find module` after `npm install` | The container has its own `node_modules`: `docker compose --profile dev up -d --build -V web-dev` |
| `api-dev` restarts or is `unhealthy` | `docker compose --profile dev logs api-dev`; usually a migration or settings error |
| `/usr/bin/env: 'sh\r'` or `exec format error` | `docker-entrypoint.sh` got Windows line endings; `.gitattributes` forces LF, re-checkout the file |
| Changes in `pyproject.toml` not picked up | Rebuild: `up -d --build` |
