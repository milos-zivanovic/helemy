# Helemy API image.
# Build context is api/ (this folder), see infrastructure/docker-compose.yml.

# ---- Build stage: install dependencies into an isolated virtualenv ----
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH

WORKDIR /build
COPY pyproject.toml README.md ./
RUN pip install .

# ---- Runtime stage ----
FROM python:3.12-slim

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=helemy.settings

# Non-root user that owns the app and its writable folders
RUN useradd --create-home --shell /bin/bash app

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY --chown=app:app . .
COPY --chown=app:app --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Writable dirs; named volumes mounted here inherit this ownership on first use
RUN mkdir -p /app/data /app/media /app/staticfiles \
    && chown -R app:app /app/data /app/media /app/staticfiles

USER app

EXPOSE 8000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["gunicorn", "helemy.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
