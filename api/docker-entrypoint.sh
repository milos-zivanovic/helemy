#!/bin/sh
# Runs before the container's command (runserver / gunicorn / manage.py ...).
# Toggle steps with env vars set in infrastructure/docker-compose.yml.
set -e

if [ "${DJANGO_MIGRATE:-0}" = "1" ]; then
    echo "entrypoint: applying migrations"
    python manage.py migrate --noinput
fi

if [ "${DJANGO_COLLECTSTATIC:-0}" = "1" ]; then
    echo "entrypoint: collecting static files"
    python manage.py collectstatic --noinput
fi

exec "$@"
