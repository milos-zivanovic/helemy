# Deployment (production)

How Helemy runs in production and how to set it up from scratch. Local Docker profiles are in
[README.md](README.md).

## Overview

| What | Where | Address |
|---|---|---|
| Web (React build) | Cloudflare Pages, uploaded by `deploy.yml` after the API (Pages builds nothing itself) | https://helemy.com |
| API (Django, gunicorn) | Google Cloud Run, region `europe-west1` (Belgium), 0–2 instances | https://api.helemy.com (also `helemy-api-<project-number>.europe-west1.run.app`) |
| Migrations | Cloud Run job `helemy-migrate`, run by the deploy workflow | |
| Database | Supabase PostgreSQL, `eu-west-1` (Ireland), session pooler | |
| Media (uploaded images) | Cloudflare R2 bucket `helemy-media`, public | https://media.helemy.com |
| Database backups | Cloudflare R2 bucket `helemy-backups`, private; weekly, [`backup.yml`](../.github/workflows/backup.yml) | |
| Email | Brevo SMTP, sender `noreply@helemy.com` | |
| Domain and DNS | Cloudflare | |

```
helemy.com ───────> Cloudflare Pages
                       │ fetch, Authorization: Bearer <JWT>
api.helemy.com ───> Cloud Run: helemy-api ──> Supabase PostgreSQL
                                         └──> Cloudflare R2 (helemy-media) <── media.helemy.com
GitHub Actions: CI (pull requests, master) → on master: deploy.yml (image → Artifact Registry → migrate job → API → web to Pages)
                     backup.yml (weekly pg_dump → R2 helemy-backups)
```

Why `europe-west1` and not Frankfurt: Cloud Run maps a custom domain (`api.helemy.com`) only in some
regions, and `europe-west3` isn't one of them. The other ways to get a custom domain cost money
(a load balancer is ~$18/month) or add moving parts (a Cloudflare Worker in front).

Domain mapping is a **preview** feature of Cloud Run: Google doesn't recommend it for production
because of latency. That's fine for an app of this size. If it ever becomes a problem, put a Cloudflare
Worker or Firebase Hosting in front of the `*.run.app` URL instead.

Deploys:

- **Tests**: CI runs on every pull request, again on each new commit; `master` only accepts pull
  requests whose CI passed (step 11). After the merge CI runs once more on `master`.
- **Production**: CI passed on `master` → [`deploy.yml`](../.github/workflows/deploy.yml): the API first,
  then the web app, so the web never goes out untested or before the API it calls. Or by hand: Actions
  → Deploy → Run workflow (the current `master`, without CI). The API part only replaces the image; env
  variables and secrets stay as set below.
- **No previews**: Pages' own builds (production and branch previews) are off (step 9, item 6). A branch
  preview would run untested code against the production API and its data; web changes are checked
  locally and by CI's e2e test instead.

## Costs and limits

- **Cloud Run**: within the free tier for this traffic. The cost ceiling comes from `--max-instances=2`,
  plus a budget alert (step 5). Requests that aren't the API's (web, images) never reach Cloud Run.
- **Supabase free**: 500 MB database, 2 active projects per organization. A project with no activity for
  a week is paused; the weekly backup job runs a query, so this shouldn't happen.
- **R2**: 10 GB free, no fee for downloads (egress).
- **Pages**: free.
- **Brevo**: ~300 emails a day free.
- **Artifact Registry**: 0.5 GB free; a cleanup policy keeps the last 5 images.
- **Domain**: ~$10–11 a year (Cloudflare sells at cost).

## Setup, step by step

Do the steps in this order: later steps need the values from earlier ones. Write the values marked
**→ note** into a password manager. Everything marked Cloud Shell runs in the browser terminal of the
Google Cloud console; nothing has to be installed locally except Docker (step 10).

The steps also work in a different order, as long as the API comes first: steps 2 and 5–8 put the API
online on its `*.run.app` URL (already in `ALLOWED_HOSTS`, step 7) with only `SECRET_KEY` and
`DATABASE_URL` (leave the other secrets out of step 6 and of `SECRETS`, and the `MEDIA_*` lines out of
`env.yaml`). Without the media variables images go to the container's disk and are lost, without
`EMAIL_URL` emails only go to the log. The domain, R2 and Brevo are then added one by one with the
"Adding a setting later" commands in step 7 (and the custom domain part of step 7).

### 1. Domain (Cloudflare)

1. Cloudflare dashboard → Domain Registration → Register Domains → `helemy.com` → Purchase. Turn on
   **auto-renew**. Enter real contact details (ICANN requires it; Cloudflare hides them from WHOIS).
   The DNS is then on Cloudflare automatically.
2. **Confirm the contact email** Cloudflare sends after the purchase ("verify your contact information"):
   without it the domain is suspended after 15 days.
3. SSL/TLS → Overview → Configure → **Custom SSL/TLS → Full (strict)** (not "Automatic").
4. SSL/TLS → Edge Certificates → **Always Use HTTPS**: on.

### 2. Database (Supabase)

1. New project `helemy`, a region close to `europe-west1`: **West EU (Ireland)** (`eu-west-1`, used in
   production) or West EU (Paris). Let Supabase **generate the database password**: letters and digits
   only, so nothing has to be percent-encoded (**→ note**).
2. **Turn off the Data API**: when creating the project, Security options → untick "Enable Data API" (or
   later Project Settings → Data API). Otherwise Supabase exposes the tables of the `public` schema (all of
   Django's) through its REST API. Django talks to PostgreSQL directly and doesn't need it.
3. **Connect** (top of the dashboard) → **Session pooler** → copy the URI, put the password in place of
   `[YOUR-PASSWORD]` (no brackets) and add `?sslmode=require`:
   `postgresql://postgres.<ref>:<password>@aws-<n>-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`
   (**→ note**: this is `DATABASE_URL`). Copy the host as shown, its `aws-<n>` prefix varies. The user is
   `postgres.<ref>`, not `postgres`. Cloud Run needs the pooler, because the direct connection is IPv6
   only. Percent-encode special characters in the password (`@` → `%40`, `/` → `%2F`, `#` → `%23`, `:` → `%3A`).

Step 6 tests the URL before it's stored. Later, whenever this URL is needed again (step 8, step 10),
take it from the secret that's known to work, not from memory:
`gcloud secrets versions access latest --secret=helemy-database-url; echo` (Cloud Shell; it prints the
password, `clear` afterwards).

### 3. Media and backups (Cloudflare R2)

1. R2 Object Storage → Purchase R2 Plan → **Free**. R2 asks for a payment method even on the free plan.
2. Copy the **Account ID** from the R2 overview (Account Details; it's also in the dashboard URL,
   `dash.cloudflare.com/<account-id>/...`). The endpoint is
   `https://<account-id>.r2.cloudflarestorage.com` (**→ note**; the overview shows it as "S3 API").
3. Create bucket `helemy-media` (location: Automatic, or the hint Western Europe; storage class Standard)
   → Settings → Custom Domains → Add → `media.helemy.com` → Connect domain. This makes it public on that
   domain only (proxied, orange cloud). Leave the **Public Development URL** (`r2.dev`) **disabled**.
   Check: `https://media.helemy.com/x.jpg` answers "object not found" once the domain is Active.
4. Create bucket `helemy-backups` (no custom domain, no `r2.dev`) → Settings → Object lifecycle rules →
   Add rule `delete-after-90-days`, whole bucket, delete objects after 90 days. Keep the default
   multipart abort rule.
5. R2 overview → API → Manage API tokens → **Create Account API token**, twice (no TTL, no IP filter:
   Cloud Run and GitHub have no fixed IPs):
   - `helemy-media`: Object Read & Write, only bucket `helemy-media` → Access Key ID + Secret (**→ note**)
   - `helemy-backups`: Object Read & Write, only bucket `helemy-backups` → Access Key ID + Secret (**→ note**)

   The Secret Access Key is shown once. Lost it: delete the token and create a new one (then step 6's
   "changing a secret").

### 4. Email (Brevo)

1. Create an account (Free plan). Some new accounts get "SMTP account not yet activated" and have to
   ask Brevo's support, which takes a day or two.
2. Account menu → **Senders, Domains & Dedicated IPs** → Domains → Add a domain → `helemy.com`:
   - **Branded subdomain** (link tracking and return path, for marketing): skip it, or accept the
     suggested name if it can't be skipped.
   - Setup method: **Automatic** (Brevo connects to Cloudflare and adds the records itself).
   - Then check Cloudflare DNS: Brevo's CNAMEs (`brevo1._domainkey`, `brevo2._domainkey`, ...) must be
     **DNS only (grey cloud)**, and there must be only one `v=spf1` TXT record and one `_dmarc` record.
   - The domain must end up **Authenticated**.
3. Senders → Add a sender: `Helemy` / `noreply@helemy.com`. With the authenticated domain it's active
   at once. (If Brevo still wants a code sent to that address: Cloudflare Email Routing can forward
   `noreply@` to a real mailbox.)
4. **Turn off click tracking** (Transactional → Settings → Tracking): otherwise Brevo rewrites the
   password reset link to go through its own redirect.
5. SMTP & API → SMTP: note the **Login** (`...@smtp-brevo.com`, not the account's email) and create an
   SMTP key `helemy-api` (`xsmtpsib-...`, shown once) (**→ note** both). Step 6 builds `EMAIL_URL`
   from them.

### 5. Google Cloud: project, budget, registry

1. console.cloud.google.com → new project (e.g. `helemy-prod`; project IDs are global, so the console may
   add a suffix; the **project ID** is what counts, **→ note**) → link a billing account.
   - The console creates the project in the background and goes back to the home page; the bell icon
     (notifications) shows whether it worked. If it fails (usually the account's project quota), reuse an
     empty project from `gcloud projects list` (the ID can't change, the name can:
     `gcloud projects update <id> --name=helemy`).
   - Billing from Cloud Shell: `gcloud billing accounts list` (needs `OPEN: True`), then
     `gcloud billing projects link <project-id> --billing-account=<ACCOUNT_ID>` and check with
     `gcloud billing projects describe <project-id>` (`billingEnabled: true`). "Billing account ... is not
     open" when enabling a service means the project is linked to a closed account: link it to an open one.
2. Billing → Budgets & alerts → budget $10 for this project, alerts at 10 %, 50 % and 100 % (email).
   This only warns, it doesn't stop anything.
3. Open **Cloud Shell** (the `>_` icon top right; gcloud is already logged in there) and set the
   variables the next steps use. **Run this block again whenever Cloud Shell restarts** (after ~20 minutes
   idle the shell is new; files in the home directory, like `env.yaml`, stay):

```bash
PROJECT_ID=helemy-prod          # your project ID
REGION=europe-west1
GITHUB_REPO=milos-zivanovic/helemy
gcloud config set project $PROJECT_ID
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
RUNTIME_SA=helemy-api@$PROJECT_ID.iam.gserviceaccount.com
DEPLOY_SA=github-deploy@$PROJECT_ID.iam.gserviceaccount.com
SECRETS=SECRET_KEY=helemy-secret-key:latest,DATABASE_URL=helemy-database-url:latest,MEDIA_SECRET_ACCESS_KEY=helemy-media-secret-key:latest,EMAIL_URL=helemy-email-url:latest
PLACEHOLDER=us-docker.pkg.dev/cloudrun/container/hello   # Google's demo image until the first deploy
echo "project: $PROJECT_ID, number: $PROJECT_NUMBER"
```

4. Services and the image registry (enabling takes a minute or two):

```bash
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
gcloud artifacts repositories list --location=$REGION   # helemy, DOCKER
```

### 6. Google Cloud: secrets and the API's service account

Still in Cloud Shell. Secret values are read with `read -rs` (pasted, not shown, not in the shell
history) and piped into Secret Manager; Cloud Run passes them to the container as env variables.

```bash
# SECRET_KEY: generated, never shown
python3 -c 'import secrets; print(secrets.token_urlsafe(50), end="")' \
  | gcloud secrets create helemy-secret-key --data-file=-

# DATABASE_URL (step 2): paste it at the prompt, then test it before storing it
read -rs DB_URL
psql "$DB_URL" -c "select 'ok' as db;"       # prints "ok"; see Troubleshooting if not
printf '%s' "$DB_URL" | gcloud secrets create helemy-database-url --data-file=-

# R2 media secret (step 3)
read -rs MEDIA_SECRET
printf '%s' "$MEDIA_SECRET" | gcloud secrets create helemy-media-secret-key --data-file=-

# EMAIL_URL from the Brevo SMTP login and key (step 4); Python percent-encodes them (the login has an @)
read -r SMTP_LOGIN
read -rs SMTP_KEY
EMAIL_URL=$(L="$SMTP_LOGIN" K="$SMTP_KEY" python3 -c 'import os, urllib.parse as u; print("smtp+tls://%s:%s@smtp-relay.brevo.com:587" % (u.quote(os.environ["L"], safe=""), u.quote(os.environ["K"], safe="")), end="")')
printf '%s' "$EMAIL_URL" | gcloud secrets create helemy-email-url --data-file=-

# The identity the API and the migrate job run as: may only read these secrets
gcloud iam service-accounts create helemy-api
for s in helemy-secret-key helemy-database-url helemy-media-secret-key helemy-email-url; do
  gcloud secrets add-iam-policy-binding $s \
    --member=serviceAccount:$RUNTIME_SA --role=roles/secretmanager.secretAccessor
done
gcloud secrets list   # the four secrets
```

Changing a secret later: `printf '%s' "$NEW_VALUE" | gcloud secrets versions add <name> --data-file=-`
(with `read -rs NEW_VALUE` first), then deploy again (the API reads `latest` when an instance starts).

### 7. Google Cloud: the API service and the migrate job

Settings that aren't secret go into a file. The placeholders in capitals are filled in by `sed`
afterwards:

```bash
read -r R2_ACCOUNT_ID     # step 3, only the ID
read -r MEDIA_KEY_ID      # Access Key ID of the helemy-media token (not the secret)

cat > env.yaml <<'EOF'
DEBUG: "0"
HTTPS: "1"
SECURE_HSTS_SECONDS: "3600"
ALLOWED_HOSTS: "api.helemy.com,RUN_HOST"
CORS_ALLOWED_ORIGINS: "https://helemy.com"
DEFAULT_FROM_EMAIL: "Helemy <noreply@helemy.com>"
PASSWORD_RESET_URL: "https://helemy.com/reset-password?uid={uid}&token={token}"
MEDIA_BUCKET_NAME: "helemy-media"
MEDIA_ENDPOINT_URL: "https://R2_ACCOUNT_ID.r2.cloudflarestorage.com"
MEDIA_ACCESS_KEY_ID: "MEDIA_KEY_ID"
MEDIA_CUSTOM_DOMAIN: "media.helemy.com"
WEB_CONCURRENCY: "2"
NUM_PROXIES: "1"
EOF
sed -i -e "s/RUN_HOST/helemy-api-$PROJECT_NUMBER.$REGION.run.app/" \
  -e "s/R2_ACCOUNT_ID/$R2_ACCOUNT_ID/" -e "s/MEDIA_KEY_ID/$MEDIA_KEY_ID/" env.yaml
cat env.yaml

gcloud run deploy helemy-api --image=$PLACEHOLDER --region=$REGION \
  --service-account=$RUNTIME_SA --port=8000 --cpu=1 --memory=512Mi \
  --min-instances=0 --max-instances=2 --allow-unauthenticated \
  --env-vars-file=env.yaml --set-secrets=$SECRETS

gcloud run jobs create helemy-migrate --image=$PLACEHOLDER --region=$REGION \
  --service-account=$RUNTIME_SA --command=python --args=manage.py,migrate,--noinput \
  --max-retries=0 --task-timeout=10m \
  --env-vars-file=env.yaml --set-secrets=$SECRETS
```

The `*.run.app` host in `ALLOWED_HOSTS` is the service's URL, known in advance: check that the
`Service URL` printed by `run deploy` is the same. That URL now shows Google's demo page ("It's
running!") until the first deploy (step 8). It stays a working second address of the API.

`NUM_PROXIES: "1"`: Google's front end is the one proxy in front of the API (`api.helemy.com` is DNS
only, not proxied by Cloudflare). It appends the client's IP to `X-Forwarded-For`, so throttling takes
the last entry. Without it DRF uses the whole header, which the client can fill with anything and so
get a fresh throttle counter on every request. If Cloudflare ever proxies the API (orange cloud),
this becomes `2`. Check: 15 password reset requests with a made-up `X-Forwarded-For` each must end in
`429`s:

```bash
for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code} " -H "X-Forwarded-For: 10.0.0.$i" \
  https://api.helemy.com/api/auth/password/reset/ --data-urlencode "email=throttle-test@example.invalid"; done; echo
```

(The `429` comes after 6–11 requests rather than 5: throttle counters are in each worker's memory,
Django's default local-memory cache.)

**Adding a setting later.** `--update-env-vars` and `--update-secrets` add or change only the variables
given and keep the rest; do the same for the service and the job, and add the line to `env.yaml` too,
so the file stays complete. `--remove-env-vars=NAME` takes one away (and the line out of `env.yaml`).

```bash
gcloud run services update helemy-api --region=$REGION --update-env-vars=NAME=value
gcloud run jobs update helemy-migrate --region=$REGION --update-env-vars=NAME=value
# a secret (created and granted to $RUNTIME_SA as in step 6)
gcloud run services update helemy-api --region=$REGION --update-secrets=NAME=<secret-name>:latest
gcloud run jobs update helemy-migrate --region=$REGION --update-secrets=NAME=<secret-name>:latest
```

A list value with commas (like `ALLOWED_HOSTS`) needs gcloud's delimiter syntax:
`--update-env-vars=^@^ALLOWED_HOSTS=a.com,b.com`.

#### Custom domain `api.helemy.com`

1. **Prove you own the domain** (with the Google account of the GCP project):
   search.google.com/search-console → Add property → **Domain** → `helemy.com` → it shows a
   `google-site-verification=...` TXT record. Cloudflare DNS → Add record: TXT, name `@`, that content
   (Search Console may also offer to add it through Cloudflare itself) → back in Search Console: Verify.
   Keep the record: Google checks it again from time to time. Check in Cloud Shell:
   `gcloud domains list-user-verified` lists `helemy.com`.
2. Map it:

   ```bash
   gcloud beta run domain-mappings create --service=helemy-api --domain=api.helemy.com --region=$REGION
   ```

3. Cloudflare DNS → Add record: `CNAME api → ghs.googlehosted.com`, **DNS only (grey cloud)**. Google
   issues the certificate itself (15 minutes to a few hours); with the orange cloud (proxied) that fails.
   HTTPS still works with DNS only, just without Cloudflare's proxy in front. `dig +short api.helemy.com`
   must show `ghs.googlehosted.com.` and Google's IPs, not Cloudflare's (`104.x`, `172.67.x`).
4. Wait until all three are `True` (`DomainRoutable` comes first; `Retry: True` while it's still working
   is normal):

   ```bash
   gcloud beta run domain-mappings describe --domain=api.helemy.com --region=$REGION \
     --format="table(status.conditions[].type, status.conditions[].status)"
   ```

Within minutes of the certificate, the logs fill up with requests for `/wp-config.php`, `/.env`,
`/.ssh/id_ed25519` and the like: see Troubleshooting.

### 8. GitHub: deploy access (Workload Identity Federation)

GitHub Actions logs in to Google Cloud with a short-lived token instead of a stored key: GitHub signs
a token saying which repository the workflow runs in, and Google accepts it only for this repository.
The deploy account can deploy but can't read the secrets. Still in Cloud Shell:

```bash
gcloud iam service-accounts create github-deploy
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$DEPLOY_SA --role=roles/run.developer --condition=None
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$DEPLOY_SA --role=roles/artifactregistry.writer --condition=None
# may deploy a service that runs as helemy-api
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
  --member=serviceAccount:$DEPLOY_SA --role=roles/iam.serviceAccountUser

gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github --location=global \
  --workload-identity-pool=github --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition="assertion.repository=='$GITHUB_REPO'"
gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$GITHUB_REPO"

echo "GCP_PROJECT_ID=$PROJECT_ID"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
echo "GCP_DEPLOY_SERVICE_ACCOUNT=$DEPLOY_SA"
```

If a binding says the new service account doesn't exist yet, wait a few seconds and run it again.

GitHub → repository → Settings → Secrets and variables → Actions. Variables go in the **Variables** tab
(the workflows read them as `vars.*`), secrets in the **Secrets** tab. No spaces around the values:

| Kind | Name | Value |
|---|---|---|
| Variable | `GCP_PROJECT_ID` | printed above |
| Variable | `GCP_REGION` | `europe-west1` |
| Variable | `GCP_WORKLOAD_IDENTITY_PROVIDER` | printed above |
| Variable | `GCP_DEPLOY_SERVICE_ACCOUNT` | printed above |
| Variable | `R2_ENDPOINT_URL` | `https://<account-id>.r2.cloudflarestorage.com` |
| Variable | `R2_BACKUP_BUCKET` | `helemy-backups` |
| Secret | `BACKUP_DATABASE_URL` | `DATABASE_URL`, copied from the secret (end of step 2) |
| Secret | `R2_BACKUP_ACCESS_KEY_ID` | `helemy-backups` token (step 3), not the media one |
| Secret | `R2_BACKUP_SECRET_ACCESS_KEY` | `helemy-backups` token (step 3) |

Then Actions → **Deploy** → Run workflow (`master`), about 5 minutes: it builds the real image,
migrates the empty database and replaces the placeholder (its `web` job is skipped until step 9). Check
`https://helemy-api-<project-number>.europe-west1.run.app/api/docs/` (or https://api.helemy.com/api/docs/
once its certificate is issued): Swagger. `/` answers 404, that's expected. Supabase → Table Editor shows
Django's tables. The `auth` step can fail with `unauthorized_client` for a few minutes after the
Workload Identity setup: re-run the job.

Then Actions → **Database backup** → Run workflow, and check that a `helemy-<date>.dump` appeared in the
`helemy-backups` bucket.

### 9. Web (Cloudflare Pages)

1. **Pages, not Workers**: the dashboard's Create button leads to Workers by default, and its Git form
   looks similar (it has a "Deploy command", `npx wrangler deploy`; the Pages form has "Production
   branch" and "Framework preset"). Go to `dash.cloudflare.com/?to=/:account/pages/new` (or Workers &
   Pages → Create → **Pages** tab, or "Looking to deploy Pages? Get started") → Import an existing Git
   repository → GitHub. Install Cloudflare's GitHub app for **only selected repositories** → `helemy`.
2. Build settings:
   - Project name: `helemy` (`--project-name` in `deploy.yml`)
   - Production branch: `master`
   - Framework preset: React (Vite) (or None)
   - Root directory (advanced): `web`
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Environment variables, for this first build only (after item 6 Pages builds nothing; `deploy.yml`
   sets the same two values itself):
   - `VITE_API_URL` = `https://api.helemy.com`
   - `NODE_VERSION` = the `NODE_VERSION` from `.github/workflows/ci.yml`
4. Save and Deploy. The web then runs on `https://helemy.pages.dev`, but logging in there fails with a
   CORS error: the API only accepts `helemy.com`.
5. Project → Custom domains → `helemy.com` → Activate domain (Cloudflare adds the DNS record, proxied;
   Active within minutes). Then the same for `www.helemy.com`, and a redirect: the domain's Rules →
   Redirect Rules → template "Redirect from WWW to Root" (or by hand: hostname equals `www.helemy.com`
   → dynamic `concat("https://helemy.com", http.request.uri.path)`, 301, preserve query string).
6. **Production goes through GitHub Actions**, after CI and the API (so Pages' own build of `master`
   can't publish a web app whose tests fail, or one that's out before its API), and **no branch
   previews** (they'd run untested code against the production API). Do this after the first
   successful `web` job (item 8). Pages project → Settings → Builds → Branch control: untick **Enable
   automatic production branch deployments**; Preview branches: **None**. Pages then builds nothing
   itself; the Git connection only stays for the project's settings.
7. Cloudflare API token for the workflow: `dash.cloudflare.com/profile/api-tokens` → Create Token. On
   the form: Token name `github-pages-deploy`; Policies → **Start from scratch** → **Start with an
   Account policy** → Include your account (not "All accounts", if it's offered) → search the permission
   groups for `Pages` → **Cloudflare Pages: Edit** (only this one; the counters of all other groups
   stay at 0); Token expiration **No expiration**; no IP filter → Continue to summary → Create Token →
   copy the token (shown once). The Account ID (item 8) is the 32 hex characters after
   `dash.cloudflare.com/` in the dashboard's URL.
8. GitHub → Settings → Secrets and variables → Actions:

   | Kind | Name | Value |
   |---|---|---|
   | Variable | `CLOUDFLARE_ACCOUNT_ID` | the Account ID (step 3) |
   | Secret | `CLOUDFLARE_API_TOKEN` | the token from item 7 |

   Then Actions → **Deploy** → Run workflow: its `web` job (skipped as long as `CLOUDFLARE_ACCOUNT_ID`
   isn't set) builds `web/` and runs `wrangler pages deploy --branch=master`. Pages → Deployments shows
   it as the production deployment, made by Wrangler / direct upload.

[`web/public/_headers`](../web/public/_headers) sets the cache headers; Pages serves `index.html` for
unknown paths itself (React Router).

### 10. First admin user

Run `createsuperuser` against the production database from your machine, so the password is never stored
anywhere. Docker Desktop running; PowerShell, from the repository root:

```powershell
docker build -t helemy-api:prod api
$env:DATABASE_URL = Read-Host "DATABASE_URL"   # paste it (end of step 2); Read-Host keeps it out of the history
docker run --rm -it -e SECRET_KEY=local-only -e DATABASE_URL helemy-api:prod python manage.py createsuperuser
```

`-e DATABASE_URL` without a value passes the variable on from the shell. (In bash: `read -rs DATABASE_URL;
export DATABASE_URL`, then the same `docker run`.)

`createsuperuser` gets a personal household (the `post_save` signal) but not what sign up seeds
(`create_default_finances`: categories and an account). If the admin also uses the app, seed it
(only once, it doesn't check for duplicates):

```powershell
docker run --rm -e SECRET_KEY=local-only -e DATABASE_URL helemy-api:prod python manage.py shell -c "from django.db import transaction; from users.models import User; from finances.services import create_default_finances; h = User.objects.get(is_superuser=True).get_active_household(); transaction.atomic(create_default_finances)(h); print('OK:', h)"
Remove-Item Env:DATABASE_URL
```

Then in the admin (https://api.helemy.com/admin/) → Users: first and last name, language (`en` by
default).

### 11. Protect `master` (GitHub)

Every push to `master` goes to production once CI passes on it (`deploy.yml`). A ruleset makes `master`
accept only pull requests whose CI passed, so a failure shows up in the PR, not after the merge (free
for a public repository): GitHub → repository → Settings → Rules → Rulesets → New ruleset → **New branch
ruleset**:

- Ruleset name: `master`, Enforcement status: **Active**
- Target branches: Add target → **Include default branch**
- Rules:
  - **Restrict deletions** and **Block force pushes** (on by default): keep
  - **Require a pull request before merging**, required approvals `0` (a solo project; it's there so
    nothing reaches `master` without going through CI)
  - **Require status checks to pass** → Add checks → `api`, `web`, `e2e`, `docker` (the jobs of
    `ci.yml`; GitHub suggests them once CI has run). Optionally **Require branches to be up to date
    before merging**: if `master` moved on since the PR's last CI run, GitHub shows "Update branch"
    and CI runs again on what will actually be merged (otherwise CI on `master` catches it, after the
    merge).
- Bypass list: leave empty, or add Repository admin for emergencies (a direct push still goes
  through CI on `master` before it's deployed).

When a CI job is renamed or added, update the ruleset's checks; a required check that no longer runs
blocks every pull request.

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
| `password authentication failed for user "postgres"` (`psql`, `createsuperuser`, backup) | The URL used differs from the one that works: copy it from the secret (end of step 2) instead of retyping it. The message says `postgres` even when the user is `postgres.<ref>` |
| `Tenant or user not found` | Not the session pooler URI, or the user isn't `postgres.<ref>` |
| API answers `400 Bad Request` | The host isn't in `ALLOWED_HOSTS` |
| Web: requests blocked by CORS | The web's origin isn't in `CORS_ALLOWED_ORIGINS` (only `https://helemy.com`; not `helemy.pages.dev` or `www`, which redirects) |
| Admin login: `CSRF verification failed` | `HTTPS` must be `1` on Cloud Run |
| `api.helemy.com` certificate stays `Unknown`/`False` for hours | Orange cloud on the `api` record, a typo in the CNAME, or a CAA record that excludes Google. Details: `gcloud beta run domain-mappings describe --domain=api.helemy.com --region=europe-west1 --format="yaml(status.conditions)"` |
| Image upload fails with an R2 checksum error | Add `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` and `AWS_RESPONSE_CHECKSUM_VALIDATION=when_required` (step 7, "Adding a setting later") |
| No email arrives | Cloud Run → Services → `helemy-api` → Logs: `SMTPAuthenticationError` = SMTP login/key or the Brevo SMTP account isn't activated; `SMTPSenderRefused` = sender not active. Brevo → Transactional → Logs shows what it received. First emails from a new domain may land in spam |
| Deploy: `web` job fails at "Upload to Cloudflare Pages" | `Authentication error` = the `CLOUDFLARE_API_TOKEN` secret or its permission (Cloudflare Pages: Edit); `Project not found` = `CLOUDFLARE_ACCOUNT_ID`, or the project isn't called `helemy` (`--project-name` in `deploy.yml`) |
| Deploy: `web` job skipped | `CLOUDFLARE_ACCOUNT_ID` variable missing (step 9, item 8), or the `api` job failed |
| Pages: "An unknown error occurred" on Save and Deploy | The project name is already used in the account (e.g. a Worker from the Workers form: delete it), or Cloudflare's GitHub app has no access to the repository (github.com/settings/installations) |
| Logs full of 404s for `/wp-config.php`, `/.env`, `/.ssh/...` | Bots that read the public Certificate Transparency logs and scan every new domain. Harmless: Django serves no files from disk except `/static/` |
| Supabase project paused | Supabase dashboard → Restore; check that the weekly backup workflow runs |
| First request after a pause is slow (1–3 s) | Cloud Run starts an instance (scale to zero). `--min-instances=1` removes it, but then you pay for an always-on instance |
