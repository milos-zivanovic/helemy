# Deployment (production)

How Helemy runs in production and how to set it up from scratch. Local Docker profiles are in
[README.md](README.md).

## Overview

| What | Where | Address |
|---|---|---|
| Web (React build) | Cloudflare Pages, built from this repo on every push | https://helemy.com (previews: `<id>.helemy.pages.dev`) |
| API (Django, gunicorn) | Google Cloud Run, region `europe-west1` (Belgium), 0–2 instances | https://api.helemy.com |
| Migrations | Cloud Run job `helemy-migrate`, run by the deploy workflow | |
| Database | Supabase PostgreSQL (session pooler) | |
| Media (uploaded images) | Cloudflare R2 bucket `helemy-media`, public | https://media.helemy.com |
| Database backups | Cloudflare R2 bucket `helemy-backups`, private; weekly, [`backup.yml`](../.github/workflows/backup.yml) | |
| Email | Brevo SMTP | |
| Domain and DNS | Cloudflare | |

```
helemy.com ───────> Cloudflare Pages
                       │ fetch, Authorization: Bearer <JWT>
api.helemy.com ───> Cloud Run: helemy-api ──> Supabase PostgreSQL
                                         └──> Cloudflare R2 (helemy-media) <── media.helemy.com
GitHub Actions: CI → deploy.yml (image → Artifact Registry → migrate job → API)
                     backup.yml (weekly pg_dump → R2 helemy-backups)
```

Why `europe-west1` and not Frankfurt: Cloud Run maps a custom domain (`api.helemy.com`) only in some
regions, and `europe-west3` isn't one of them. The other ways to get a custom domain cost money
(a load balancer is ~$18/month) or add moving parts (a Cloudflare Worker in front).

Domain mapping is a **preview** feature of Cloud Run: Google doesn't recommend it for production
because of latency. That's fine for an app of this size. If it ever becomes a problem, put a Cloudflare
Worker or Firebase Hosting in front of the `*.run.app` URL instead.

Deploys:

- **API**: push to `master` → CI → [`deploy.yml`](../.github/workflows/deploy.yml). Or by hand: Actions → Deploy API
  → Run workflow. The workflow only replaces the image; env variables and secrets stay as set below.
- **Web**: Cloudflare Pages builds `master` into production and every other branch into a preview.

## Costs and limits

- **Cloud Run**: within the free tier for this traffic. The cost ceiling comes from `--max-instances=2`,
  plus a budget alert (step 5). Requests that aren't the API's (web, images) never reach Cloud Run.
- **Supabase free**: 500 MB database, 2 active projects per organization. A project with no activity for
  a week is paused; the weekly backup job runs a query, so this shouldn't happen.
- **R2**: 10 GB free, no fee for downloads (egress).
- **Pages**: free.
- **Brevo**: ~300 emails a day free.
- **Artifact Registry**: 0.5 GB free; a cleanup policy keeps the last 5 images.

## Setup, step by step

Do the steps in this order: later steps need the values from earlier ones. Write the values marked
**→ note** into a password manager.

### 1. Domain (Cloudflare)

1. Cloudflare dashboard → Domain Registration → Register Domains → `helemy.com`.
   The DNS is then on Cloudflare automatically.
2. SSL/TLS → Overview: mode **Full (strict)**.

### 2. Database (Supabase)

1. New project `helemy`, region **West EU (Paris)** (`eu-west-3`, close to `europe-west1`). Generate a
   strong database password (**→ note**).
2. **Turn off the Data API**: when creating the project untick "Enable Data API", or later
   Project Settings → Data API. Otherwise Supabase exposes the tables of the `public` schema (all of
   Django's) through its REST API. Django talks to PostgreSQL directly and doesn't need it.
3. Connect → **Session pooler** → copy the URI and add `?sslmode=require`:
   `postgresql://postgres.<ref>:<password>@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=require`
   (**→ note**: this is `DATABASE_URL`). Cloud Run needs the pooler, because the direct connection is
   IPv6 only. Percent-encode special characters in the password (`@` → `%40`, `/` → `%2F`, ...).

### 3. Media and backups (Cloudflare R2)

1. R2 → enable it. R2 asks for a payment method even on the free plan.
2. Copy the **Account ID** from the R2 overview. The endpoint is
   `https://<account-id>.r2.cloudflarestorage.com` (**→ note**).
3. Create bucket `helemy-media` → Settings → Custom Domains → `media.helemy.com`. This makes it public
   on that domain only.
4. Create bucket `helemy-backups` (no public access) → Settings → Object lifecycle rules → delete
   objects after 90 days.
5. R2 → Manage API tokens → Create API token, twice:
   - `helemy-media`: Object Read & Write, only bucket `helemy-media` → Access Key ID + Secret (**→ note**)
   - `helemy-backups`: Object Read & Write, only bucket `helemy-backups` → Access Key ID + Secret (**→ note**)

### 4. Email (Brevo)

1. Create an account → Senders, Domains → add `helemy.com` and let Brevo add the DNS records in Cloudflare
   (or add the SPF/DKIM/DMARC records it shows by hand).
2. SMTP & API → SMTP → create an SMTP key. `EMAIL_URL` (**→ note**):
   `smtp+tls://<smtp-login>:<smtp-key>@smtp-relay.brevo.com:587` (percent-encode `@` in the login as `%40`).

### 5. Google Cloud: project, budget, registry

1. console.cloud.google.com → new project (e.g. `helemy-prod`; the **project ID** is what counts, **→ note**)
   → link a billing account.
2. Billing → Budgets & alerts → budget $10 for this project, alerts at 10 %, 50 % and 100 % (email).
   This only warns, it doesn't stop anything.
3. Open **Cloud Shell** (the `>_` icon top right; gcloud is already logged in there) and run:

```bash
PROJECT_ID=helemy-prod          # your project ID
REGION=europe-west1
GITHUB_REPO=milos-zivanovic/helemy
gcloud config set project $PROJECT_ID

gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

# Docker images of the API; keep only the 5 newest (stays in the free 0.5 GB)
gcloud artifacts repositories create helemy --repository-format=docker --location=$REGION
cat > cleanup.json <<'EOF'
[
  {"name": "keep-5", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 5}},
  {"name": "delete-rest", "action": {"type": "Delete"}, "condition": {"tagState": "any"}}
]
EOF
gcloud artifacts repositories set-cleanup-policies helemy --location=$REGION --policy=cleanup.json
```

### 6. Google Cloud: secrets and the API's service account

Still in Cloud Shell (the same variables). Replace the `<...>` values with what you noted:

```bash
# Secrets: Cloud Run passes them to the container as env variables
python3 -c 'import secrets; print(secrets.token_urlsafe(50), end="")' \
  | gcloud secrets create helemy-secret-key --data-file=-
printf '%s' '<DATABASE_URL from step 2>' | gcloud secrets create helemy-database-url --data-file=-
printf '%s' '<helemy-media secret from step 3>' | gcloud secrets create helemy-media-secret-key --data-file=-
printf '%s' '<EMAIL_URL from step 4>' | gcloud secrets create helemy-email-url --data-file=-

# The identity the API and the migrate job run as: may only read these secrets
gcloud iam service-accounts create helemy-api
RUNTIME_SA=helemy-api@$PROJECT_ID.iam.gserviceaccount.com
for s in helemy-secret-key helemy-database-url helemy-media-secret-key helemy-email-url; do
  gcloud secrets add-iam-policy-binding $s \
    --member=serviceAccount:$RUNTIME_SA --role=roles/secretmanager.secretAccessor
done
```

Changing a secret later: `printf '%s' '<new value>' | gcloud secrets versions add <name> --data-file=-`,
then deploy again (the API reads `latest` when an instance starts).

### 7. Google Cloud: the API service and the migrate job

Settings that aren't secret go into a file. In Cloud Shell, replace `<account-id>` and
`<helemy-media access key id>`:

```bash
cat > env.yaml <<'EOF'
DEBUG: "0"
HTTPS: "1"
SECURE_HSTS_SECONDS: "3600"
ALLOWED_HOSTS: "api.helemy.com"
CORS_ALLOWED_ORIGINS: "https://helemy.com"
CORS_ALLOWED_ORIGIN_REGEXES: "^https://[a-z0-9-]+\\.helemy\\.pages\\.dev$"
DEFAULT_FROM_EMAIL: "Helemy <noreply@helemy.com>"
PASSWORD_RESET_URL: "https://helemy.com/reset-password?uid={uid}&token={token}"
MEDIA_BUCKET_NAME: "helemy-media"
MEDIA_ENDPOINT_URL: "https://<account-id>.r2.cloudflarestorage.com"
MEDIA_ACCESS_KEY_ID: "<helemy-media access key id>"
MEDIA_CUSTOM_DOMAIN: "media.helemy.com"
WEB_CONCURRENCY: "2"
EOF

SECRETS=SECRET_KEY=helemy-secret-key:latest,DATABASE_URL=helemy-database-url:latest,MEDIA_SECRET_ACCESS_KEY=helemy-media-secret-key:latest,EMAIL_URL=helemy-email-url:latest
PLACEHOLDER=us-docker.pkg.dev/cloudrun/container/hello   # Google's demo image until the first deploy

gcloud run deploy helemy-api --image=$PLACEHOLDER --region=$REGION \
  --service-account=$RUNTIME_SA --port=8000 --cpu=1 --memory=512Mi \
  --min-instances=0 --max-instances=2 --allow-unauthenticated \
  --env-vars-file=env.yaml --set-secrets=$SECRETS

gcloud run jobs create helemy-migrate --image=$PLACEHOLDER --region=$REGION \
  --service-account=$RUNTIME_SA --command=python --args=manage.py,migrate,--noinput \
  --max-retries=0 --task-timeout=10m \
  --env-vars-file=env.yaml --set-secrets=$SECRETS
```

The Pages project name in `CORS_ALLOWED_ORIGIN_REGEXES` must match step 9: if `helemy` is taken
there, Cloudflare gives a name like `helemy-abc`. Change it later with
`gcloud run services update helemy-api --region=$REGION --update-env-vars=...`, and do the same for the
job (`gcloud run jobs update`).

Custom domain (Cloud Run → Manage custom domains, or):

```bash
gcloud beta run domain-mappings create --service=helemy-api --domain=api.helemy.com --region=$REGION
```

Google first asks you to verify that you own `helemy.com`; it shows a TXT record for Cloudflare DNS. Then
add the record it asks for in Cloudflare DNS: `CNAME api → ghs.googlehosted.com`, **DNS only (grey
cloud)**. Google issues the certificate itself (15 minutes to a few hours). With the orange cloud
(proxied) that can fail. HTTPS still works with DNS only, just without Cloudflare's proxy in front.

### 8. GitHub: deploy access (Workload Identity Federation)

GitHub Actions logs in to Google Cloud with a short-lived token instead of a stored key. Still in
Cloud Shell:

```bash
gcloud iam service-accounts create github-deploy
DEPLOY_SA=github-deploy@$PROJECT_ID.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$DEPLOY_SA --role=roles/run.developer
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$DEPLOY_SA --role=roles/artifactregistry.writer
# may deploy a service that runs as helemy-api
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
  --member=serviceAccount:$DEPLOY_SA --role=roles/iam.serviceAccountUser

gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github --location=global \
  --workload-identity-pool=github --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition="assertion.repository=='$GITHUB_REPO'"
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$GITHUB_REPO"

echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
echo "GCP_DEPLOY_SERVICE_ACCOUNT=$DEPLOY_SA"
```

GitHub → repository → Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Variable | `GCP_PROJECT_ID` | project ID (step 5) |
| Variable | `GCP_REGION` | `europe-west1` |
| Variable | `GCP_WORKLOAD_IDENTITY_PROVIDER` | printed above |
| Variable | `GCP_DEPLOY_SERVICE_ACCOUNT` | printed above |
| Variable | `R2_ENDPOINT_URL` | `https://<account-id>.r2.cloudflarestorage.com` |
| Variable | `R2_BACKUP_BUCKET` | `helemy-backups` |
| Secret | `BACKUP_DATABASE_URL` | `DATABASE_URL` from step 2 |
| Secret | `R2_BACKUP_ACCESS_KEY_ID` | `helemy-backups` token (step 3) |
| Secret | `R2_BACKUP_SECRET_ACCESS_KEY` | `helemy-backups` token (step 3) |

Then Actions → **Deploy API** → Run workflow. It builds the real image, migrates the empty database
and replaces the placeholder. Check https://api.helemy.com/api/docs/ (after the certificate from
step 7 is issued; until then use the `*.run.app` URL that Cloud Run shows, after temporarily
adding its host to `ALLOWED_HOSTS`).

Then Actions → **Database backup** → Run workflow, and check that a `.dump` appeared in the
`helemy-backups` bucket.

### 9. Web (Cloudflare Pages)

1. Workers & Pages → Create → Pages → Connect to Git → repository `helemy`.
2. Build settings:
   - Production branch: `master`
   - Framework preset: React (Vite) (or None)
   - Root directory: `web`
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Environment variables (Production **and** Preview):
   - `VITE_API_URL` = `https://api.helemy.com`
   - `NODE_VERSION` = the `NODE_VERSION` from `.github/workflows/ci.yml`
4. After the first build: Custom domains → `helemy.com` (Cloudflare adds the DNS record). Optionally add
   `www.helemy.com` and a redirect rule from `www` to the bare domain.

[`web/public/_headers`](../web/public/_headers) sets the cache headers; Pages serves `index.html` for
unknown paths itself (React Router).

### 10. First admin user

Run `createsuperuser` against the production database from your machine, so the password is never stored
anywhere. From `infrastructure/`:

```bash
docker compose --profile prod build api-prod
docker run --rm -it -e SECRET_KEY=local-only -e DATABASE_URL='<DATABASE_URL from step 2>' \
  helemy-api:prod python manage.py createsuperuser
```

The admin is at https://api.helemy.com/admin/.

## Restoring a backup

Download a `.dump` from the `helemy-backups` bucket (R2 dashboard), then from its folder:

```bash
docker run --rm -v "$PWD:/backup" -e DATABASE_URL='<target DATABASE_URL>' postgres:17-alpine \
  sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" /backup/<file>.dump'
```

`--clean` drops and recreates Helemy's tables in the target. Try a restore into a local database first
(the `dev-pg` profile: `postgresql://postgres:postgres@host.docker.internal:5432/helemy`).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Deploy fails at "Migrate" | Logs: Cloud Run → Jobs → `helemy-migrate` → the execution. Usually `DATABASE_URL` (password encoding, `sslmode`) |
| API answers `400 Bad Request` | The host isn't in `ALLOWED_HOSTS` (e.g. the `*.run.app` URL) |
| Web: requests blocked by CORS | The web's origin isn't in `CORS_ALLOWED_ORIGINS` / `CORS_ALLOWED_ORIGIN_REGEXES` (e.g. a different Pages project name) |
| Admin login: `CSRF verification failed` | `HTTPS` must be `1` on Cloud Run |
| Image upload fails with an R2 checksum error | Add `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` and `AWS_RESPONSE_CHECKSUM_VALIDATION=when_required` to `env.yaml` |
| Supabase project paused | Supabase dashboard → Restore; check that the weekly backup workflow runs |
| First request after a pause is slow (1–3 s) | Cloud Run starts an instance (scale to zero). `--min-instances=1` removes it, but then you pay for an always-on instance |
