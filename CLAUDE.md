# life_tracker — instructions for Claude Code

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
- Never commit, push or create a PR/MR: the user does all git writes (read-only git is fine). An explicit
  request to do one is a one-time approval for that action only; afterwards go back to this rule.
- Work on `api/` and `web/` (and their Docker setup); mobile work and the data import from the old `wallet`
  app need the user's explicit approval.
- The user is a backend engineer learning frontend: for web work, write the code and explain each new
  concept (with Django analogies where they help), not just hand it over.
- The user runs Docker commands themselves; don't build or start containers unless asked.

## Checks (host, from `api/`; run before finishing any change)
The repo root `.venv` has the deps from `api/pyproject.toml` (Python 3.14 here, project targets 3.12+).
- `../.venv/Scripts/python.exe -m ruff format .` and `../.venv/Scripts/python.exe -m ruff check .`
- `../.venv/Scripts/python.exe manage.py test` (Django's runner, not pytest)
- `../.venv/Scripts/python.exe manage.py spectacular --file /dev/null --validate` (keep it warning-free)
- `../.venv/Scripts/python.exe manage.py makemigrations --check --dry-run`

## Checks (host, from `web/`)
Node is installed with fnm and isn't on PATH in Claude Code's shells: prepend
`/c/Users/zmilo/AppData/Roaming/fnm/node-versions/v26.13.1/installation` (Bash) before `npm`.
- `npm run format`, `npm run typecheck`, `npm run lint`, `npm run build`
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
  Sign up seeds `finances.services.DEFAULT_CATEGORIES`.
- `fitness.MuscleGroup` is global reference data (no household), read-only via the API; defaults seeded by
  `fitness/migrations/0003_seed_muscle_groups.py`, edited in the admin.
- `finances.Transaction.date` is the day it happened (filters/budgets use it); `created_at` is audit only.
  DELETE on transactions is a soft delete (`is_deleted=True`).
- Pagination: `common.pagination.StandardResultsSetPagination` (50) by default, `SmallResultsSetPagination` (20).
  Permissions: `IsHouseholdMember` on all domain endpoints. URLs under `/api/`.
- TIME_ZONE `Europe/Belgrade`, `USE_TZ = True`: use `timezone.localdate()`, not `now().date()`.

## Repo rules
- No `.env.example` files. A new env variable goes into the table in `api/README.md` (Configuration) and,
  if prod uses it, into `infrastructure/README.md` and the `api-prod` `environment:` in compose.
  Don't edit the user's `api/.env`; say in the summary if a variable should be added there.
- Never commit `api/.env`, `infrastructure/.env`, `api/data/`, `infrastructure/data/` (all gitignored).
- Keep `.gitattributes`: it forces LF for `*.sh` and `Dockerfile` (`api/docker-entrypoint.sh` breaks in Linux
  containers with CRLF).
- Dependencies only in `api/pyproject.toml` (hatchling, runtime deps pinned exactly); no requirements.txt.
- When something documented changes (endpoints, env variables, commands), update the README that owns it.
