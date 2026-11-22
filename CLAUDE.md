# helemy — instructions for Claude Code

Monorepo: Django REST API (`api/`), Docker Compose (`infrastructure/`), React web client (`web/`, in progress)
and a planned Expo mobile app (`mobile/`). What the project is, how to run it, endpoints and env variables are
in the READMEs (root, `api/`, `infrastructure/`, `web/`); read them instead of duplicating their content here.

## Working agreement
- Communicate in Serbian (Latin script); code, identifiers and commit messages stay in English.
- End every reply that finishes a piece of work with a short summary block:
  1. **Urađeno**: what was done
  2. **Moje odluke**: decisions made without asking, for the user to review
  3. **Pitanja**: open questions the user needs to answer ("nema" if none)
  4. **Predlozi**: optional, only when genuinely useful
- Git workflow (Claude runs it, the user approves each step):
  - Every task gets its own branch from an up-to-date `origin/master` (`feature/...`, `fix/...`, `docs/...`),
    created locally and pushed to GitHub.
  - Before EVERY commit, show the files and the commit message and ask once for both the commit and its push;
    after the user's yes, commit and push together. Anything not covered by that yes needs a new one.
  - Opening the pull request and the merge are ALWAYS the user's, done by hand: never open, merge or approve
    a PR, never enable auto-merge, never merge or push into `master` (not even locally). When a piece is
    pushed, give the user the branch name and a suggested PR title and description (base `master`).
  - After the user merges: update `master` locally and delete the merged local branch; delete the remote
    branch only when asked.
- Work on `api/` and `web/` (and their Docker setup); mobile work needs the user's explicit approval.
- The old `wallet` app is gone: its data was migrated to production by hand (SQL) on 2026-11-22, and its
  Heroku app, Supabase project and GitHub repo are shut down or archived. Nothing left to import; comments
  saying something was "taken from the old wallet app" are history only.
- The user is a backend engineer learning frontend: for web work, write the code and explain each new
  concept (with Django analogies where they help), not just hand it over.
- The user runs Docker commands themselves; don't build or start containers unless asked.

## Checks (host, from `api/`; run before finishing any change)
The virtualenv is `api/.venv` (Python 3.14 here, project targets 3.12+). The user runs the app in Docker, so it may be
empty: if `.venv/Scripts/python.exe -c "import django"` fails, say so instead of installing anything (`pip install ".[dev]"`
from `api/` needs their OK).
- `.venv/Scripts/python.exe -m ruff format .` and `.venv/Scripts/python.exe -m ruff check .`
- `.venv/Scripts/python.exe manage.py test` (Django's runner, not pytest)
- `.venv/Scripts/python.exe manage.py spectacular --file /dev/null --validate` (keep it warning-free)
- `.venv/Scripts/python.exe manage.py makemigrations --check --dry-run`

## Checks (host, from `web/`)
Node is installed with fnm and isn't on PATH in Claude Code's shells: prepend
`/c/Users/zmilo/AppData/Roaming/fnm/node-versions/v26.13.1/installation` (Bash) before `npm`.
- `npm run format`, `npm run typecheck`, `npm run lint`, `npm run test` (Vitest), `npm run build`
- `npm run test:e2e` (Playwright, ~30 s, starts its own API on :8010 and web on :3010) after a change to
  sign up/login, accounts, transactions, transfers or the balances; update `e2e/smoke.e2e.ts` when that flow changes.
- After an API change: start the API and `npm run gen:api` (or generate from `manage.py spectacular --file`
  with `npx --yes openapi-typescript@7.13.0 <file> -o src/api/schema.d.ts`), then typecheck.
- UI text only through i18n keys present in both `src/i18n/locales/sr.json` and `en.json`.
- `api/data/` (host SQLite) doesn't exist; for a live `runserver` smoke test point `DATABASE_URL` at a
  scratchpad SQLite file instead of creating it.

## Code rules (easy to break silently)
- Domain ViewSets extend `common.mixins.HouseholdModelViewSet` (filters by `request.user.get_active_household()`,
  sets `household` on create). `HouseholdMixin` must stay FIRST in the bases (MRO), otherwise DRF's
  `get_queryset`/`perform_create` win and household isolation breaks without any error.
- Writable FKs to household-owned models use `common.fields.HouseholdPrimaryKeyRelatedField`, never a plain
  `PrimaryKeyRelatedField` with `.objects.all()`.
- Every new endpoint needs an isolation test (`common.testing.HouseholdAPITestCase`: two users in separate
  households). Tests live in `<app>/tests/test_*.py`.
- Users have no `username`: login is `email`, stored lowercased, matched case-insensitively
  (`users.models.UserManager`). Auth helpers (tokens, blacklisting, reset email) are in `users/services.py`.
- A user is a member of exactly one household (`get_active_household()` relies on it). Their personal
  (owned) household is never deleted: it has no members while they're in another household and becomes active
  again when they leave or are removed. Membership changes go through `users.services` (`accept_invitation`,
  `remove_from_household`), never `household.members.add/remove` directly; households have no DELETE.
  Sign up seeds `finances.services.create_default_finances` (default categories and one account).
- `fitness.MuscleGroup` is global reference data (no household), read-only via the API; defaults seeded by
  `fitness/migrations/0003_seed_muscle_groups.py`, edited in the admin.
- `finances.Transaction.date` is the day it happened (filters/budgets use it); `created_at` is audit only.
  DELETE on transactions is a soft delete (`is_deleted=True`).
- Pagination: `common.pagination.StandardResultsSetPagination` (50) by default, `SmallResultsSetPagination` (20).
  Permissions: `IsHouseholdMember` on all domain endpoints. URLs under `/api/`.
- TIME_ZONE `Europe/Belgrade`, `USE_TZ = True`: use `timezone.localdate()`, not `now().date()`.
- User-facing API text (error messages, emails) goes through `gettext` with named placeholders, never a plain
  string or f-string, and gets a Serbian translation in `api/locale/sr_Latn/LC_MESSAGES/django.po` + a
  recompiled `django.mo` (see `api/README.md`, Languages). No GNU gettext on this machine: if it's still
  missing, say so instead of hand-editing the `.mo`.

## Repo rules
- No `.env.example` files. A new env variable goes into the table in `api/README.md` (Configuration) and,
  if prod uses it, into `infrastructure/README.md` and the `api-prod` `environment:` in compose.
  Don't edit the user's `api/.env`; say in the summary if a variable should be added there.
- Never commit `api/.env`, `infrastructure/.env`, `api/data/`, `infrastructure/data/` (all gitignored).
- Keep `.gitattributes`: it checks out every text file with LF, also on Windows (Prettier and ruff write LF, so
  CRLF checkouts made `npm run format` mark dozens of unchanged files as modified), and `*.sh`/`Dockerfile`
  must be LF anyway (`api/docker-entrypoint.sh` breaks in Linux containers with CRLF).
- Dependencies only in `api/pyproject.toml` (hatchling, runtime deps pinned exactly); no requirements.txt.
- When something documented changes (endpoints, env variables, commands), update the README that owns it.
- Production: web on Cloudflare Pages, API on Cloud Run (`deploy.yml`), PostgreSQL on Supabase, media on R2;
  setup in `infrastructure/DEPLOYMENT.md`. A new env variable prod needs also goes into its `env.yaml`
  (step 7) and the user must add it on Cloud Run; nothing may write to the container's disk (no persistent disk).
- `.github/workflows/ci.yml` runs the Checks above (API tests on PostgreSQL 16) plus the e2e test, a
  `schema.d.ts` drift check and the Docker builds: a new check or a Python/Node version bump goes there too.
