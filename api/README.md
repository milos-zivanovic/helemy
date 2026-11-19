# api — Helemy REST API

Django REST Framework backend for personal finances, fitness and nutrition. It is the single source of
data for the future web (`../web`) and mobile (`../mobile`) clients, which talk to it only over HTTP/JSON.

## Stack

- Django 5.2 LTS, Django REST Framework, django-filter
- SimpleJWT (access + refresh tokens, rotation, blacklist)
- drf-spectacular (OpenAPI 3 schema, Swagger UI, ReDoc)
- django-cors-headers, django-environ, Pillow
- SQLite for local development, PostgreSQL 16 for `dev-pg` / `prod`

Dependencies and tool config (ruff, coverage) are in [`pyproject.toml`](pyproject.toml) in this folder
(there is no `requirements.txt`).

## Folder layout

```
api/
├── helemy/         # Django project: settings.py, urls.py, wsgi/asgi
├── users/          # Custom User (login by email), Household, membership endpoints
├── finances/       # Accounts, transfers, category groups, categories, transactions, budgets
├── fitness/        # Muscle groups (global), exercises, trainings, items, sets
├── nutrition/      # Foods, consumptions, weekly summary
├── common/         # Household mixins, permissions, pagination, scoped FK field, test helpers
├── locale/         # Serbian translations of the API's messages (sr_Latn/LC_MESSAGES/django.po + .mo)
├── data/           # SQLite for `runserver` on the host; create it with `mkdir data` before `migrate`, gitignored (Docker uses ../infrastructure/data/)
├── .env            # Your local settings for `runserver` on the host (gitignored, create it yourself)
├── .dockerignore   # Keeps .env, local data and caches out of the Docker image
├── Dockerfile      # Image used by ../infrastructure/docker-compose.yml (build context: this folder)
├── pyproject.toml  # Dependencies, ruff and coverage config
└── manage.py
```

## Running with Docker (recommended)

Docker Compose lives in [`../infrastructure`](../infrastructure/README.md). From the repo root:

```bash
cd infrastructure
docker compose --profile dev up -d --build                    # start API (SQLite) on :8000, migrates automatically
docker compose --profile dev exec api-dev python manage.py createsuperuser
```

The `api/` folder is mounted into the container, so code changes reload automatically (`runserver`).
Migrations are applied on every container start by `docker-entrypoint.sh`.
Use `--profile dev-pg` and the service name `api-dev-pg` to run against PostgreSQL (API on :8001).

Useful commands (from `infrastructure/`):

```bash
docker compose logs -f api-dev
docker compose --profile dev exec api-dev python manage.py makemigrations
docker compose --profile dev exec api-dev python manage.py test
docker compose --profile dev exec api-dev python manage.py shell
docker compose --profile dev down
```

## Running on the host (without Docker)

Needs Python 3.12+. The virtualenv lives in the repo root (`.venv`), dependencies come from `api/pyproject.toml`.
From the repo root:

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
cd api
pip install ".[dev]"
# create api/.env with at least: DEBUG=1 and SECRET_KEY=<any string> (all variables: Configuration below)
mkdir -p data
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

## Configuration

Settings are in `helemy/settings.py` and read from environment variables. In Docker they come from
`environment:` in `docker-compose.yml`; on the host from `api/.env` (variables below). Real environment
variables win over `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `DEBUG` | `False` | Debug mode (`1`/`0`) |
| `SECRET_KEY` | empty (required) | Django secret key |
| `DATABASE_URL` | `sqlite:///api/data/db.sqlite3` | Database connection string |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated hosts |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,...` | Origins allowed to call the API (web/mobile dev servers) |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | `15` | Access token lifetime |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS` | `7` | Refresh token lifetime |
| `EMAIL_URL` | `consolemail://` | How emails are sent; the default prints them to the server log. SMTP: `smtp+tls://user:password@host:587` |
| `DEFAULT_FROM_EMAIL` | `Helemy <noreply@localhost>` | Sender of outgoing emails |
| `PASSWORD_RESET_URL` | `http://localhost:3000/reset-password?uid={uid}&token={token}` | Link in the reset email (a client app page); `{uid}` and `{token}` are filled in |

## Using the API

- Swagger UI: http://localhost:8000/api/docs/ (button "Authorize" → paste the access token)
- ReDoc: http://localhost:8000/api/redoc/
- OpenAPI schema: http://localhost:8000/api/schema/ (import this URL into Postman to get a ready collection)
- Django admin: http://localhost:8000/admin/

Authentication flow:

1. Sign up: `POST /api/auth/register/` with `{"email", "password", "first_name"?, "last_name"?}` →
   `user` + `access` + `refresh` (the personal household is created automatically)
2. Log in: `POST /api/auth/token/` with `{"email": "...", "password": "..."}` → `access` + `refresh`
3. Send `Authorization: Bearer <access>` on every request
4. `POST /api/auth/token/refresh/` with `{"refresh": "..."}` when the access token expires
5. Log out: `POST /api/auth/logout/` with `{"refresh": "..."}` → 204; the refresh token is blacklisted,
   the access token stays valid until it expires, so the client drops both
6. Change password (logged in): `POST /api/auth/password/change/` with `{"old_password", "new_password"}`
   → a new `access` + `refresh`; all other sessions are logged out (their refresh tokens are blacklisted)
7. Forgotten password:
   - `POST /api/auth/password/reset/` with `{"email"}` → always 204 (doesn't reveal whether the account
     exists); emails a `PASSWORD_RESET_URL` link with `uid` and `token`, valid 1 hour, limited to 5 requests/hour
   - the client page from that link posts `{"uid", "token", "new_password"}` to
     `POST /api/auth/password/reset/confirm/` → 204; the link is single-use and all sessions are logged out

Users have no `username`: `email` is the login field, stored lowercased and matched case-insensitively.
New passwords go through Django's `AUTH_PASSWORD_VALIDATORS` (length, common, numeric, similar to email).
Django admin has users (with their household memberships), households and muscle groups.

Onboarding a new user (what a client does after sign up):

1. `POST /api/auth/register/` → `user` + `access` + `refresh`, so the user is logged in right away. A personal
   household ("<first name or email>'s Household") is created with the user as owner and only member, and
   seeded with default finance category groups and categories (`finances.services.DEFAULT_CATEGORIES`)
   and one account, "Tekući račun", with balance 0 from today (`create_default_finances`).
   A user always belongs to exactly one household, and all domain data is stored there.
2. `GET /api/auth/me/` → profile (`currency` default `RSD`, `timezone` default `Europe/Belgrade`, `language`:
   `en` or `sr-latn`, set at sign up from the request's `Accept-Language`), `role` (`owner`/`member`) and
   `households`. `PATCH /api/auth/me/` with `{"language": "en" | "sr-latn"}` changes the language (the only
   preference users can change for now) and answers with the same profile. The stored language is the one
   the web client shows the user after login, and the API uses it for what doesn't answer the user's own
   request (e.g. an email caused by another member); responses follow `Accept-Language` (see Languages).
3. Initial data. Besides the seeded categories (rename, switch off or delete them as needed), the household
   starts empty. Muscle groups are global and already exist:
   - finances: `POST /api/finances/category-groups/` (`name`) and `POST /api/finances/categories/`
     (`name`, `category_group_id`) for own categories. `PATCH /api/finances/accounts/{id}/` sets the seeded
     account's real `opening_balance` and `opening_date`; `POST` adds more (cash, savings). Transactions need
     an active category and an active account (`account_id`). Budgets are
     optional (`POST /api/finances/budgets/` with `category_id`, `amount`, `start_date`, `end_date`)
   - fitness: `GET /api/fitness/muscle-groups/`, then `POST /api/fitness/exercises/` (`name`, optional
     `muscle_group_id`)
   - nutrition: `POST /api/nutrition/foods/` (`name`, `calories`, `protein`, `carbs`, `fat` per 100 g)
4. Optional, sharing data with another person (they need their own account first):
   - the owner invites: `POST /api/auth/households/{id}/invite/` with `{"email"}` → 201, a pending
     invitation (one pending invitation per user and household). Nothing is emailed; the client shows it
   - `GET /api/auth/invitations/` → pending invitations the user received or sent (as an owner)
   - the invited user answers: `POST /api/auth/invitations/{id}/accept/` → 200 with the joined household, or
     `POST /api/auth/invitations/{id}/decline/` → 204. The owner cancels with `DELETE /api/auth/invitations/{id}/`
   - accepting moves the user into the household. Their personal household is kept with all its data but
     becomes inactive (no members). Accepting fails with 400 while the user's own household has other members
     or while they are a member of another household
   - `GET /api/auth/households/{id}/members/` lists the members. `DELETE .../members/{user_id}/` (owner only;
     the owner can't be removed) removes a member: their personal household becomes active again, and the
     records they created stay in the shared household
   - a member leaves on their own with `POST /api/auth/households/{id}/leave/` → 200 with their personal
     household, which is active again (same rules as being removed; the owner can't leave)
   - `POST /api/auth/households/` returns 400, since every user already has a household. Households can't be
     deleted (no DELETE)

Endpoint groups:

| Prefix | Content |
|---|---|
| `/api/auth/` | `register/`, `token/`, `token/refresh/`, `logout/`, `password/change/`, `password/reset/` (+ `confirm/`), `me/`, `households/` (members, invite, remove member, leave), `invitations/` (+ `accept/`, `decline/`) |
| `/api/finances/` | `accounts/`, `transfers/`, `category-groups/`, `categories/`, `transactions/` (+ `suggestions/`, `breakdown/`, `balance-history/`), `budgets/`, `budgets/all/` |
| `/api/fitness/` | `muscle-groups/` (read-only; the 8 defaults are seeded by migration, edit them in the admin), `exercises/`, `trainings/` (+ `trainings/{id}/sets/`), `training-items/`, `training-sets/` |
| `/api/nutrition/` | `foods/`, `consumptions/` (`?date=`, `?start_date=`, `?end_date=`, `?food=`, `?user=`), `consumptions/weekly-summary/` |

## Finance rules worth knowing

- **Active categories** (`Category.objects.active(on_date)`): `is_active` is on (the category's and its
  group's), the day is inside the optional one-off range `start_date`..`end_date`, and inside the optional
  yearly window `start_month/start_day`..`end_month/end_day` (a window may wrap the new year, e.g.
  12/01..02/28). A group is active when it has an active category. Lists accept `?active=true|false` and `?active_on=YYYY-MM-DD`. The category list also returns
  `active_today`, the activity rules and `transactions_count`.
- A category or group that still has transactions can't be deleted (400): deleting would remove its
  transactions too. Switch it off instead (`is_active=false`).
- A transaction's category must be active on the transaction's `date`. This is checked only when the category
  or date changes, so old transactions in archived categories stay editable.
- The transaction list also returns `total_incomes`, `total_expenses`, `total_transfers` and `total` (decimal
  strings, like every amount) for all transactions matching the filters, not just the current page. Income
  and expenses leave transfers out; `total_transfers` is the net of the listed transfer legs (with `account`:
  transfers into it minus out of it; 0 without `account`, as both legs are listed); `total` = income -
  expenses + transfers, so with `account` it is that account's change in the period.
- Paginated lists return `count`, `next`, `previous`, `total_pages`, `current_page` and `results`
  (`?page=`, `?page_size=` up to 100).
- **Accounts** hold the money; every transaction belongs to one (`account_id`). An account's `balance`
  (today) is `opening_balance` + income - expenses, counting every transaction (transfer legs too) up to
  today, however old. `opening_balance` is money the account held outside the recorded transactions; it
  counts from `opening_date` on. An archived account (`is_active=false`) takes no new transactions or
  transfers; old ones stay editable. An account with transactions can't be deleted (400), only archived.
- **Transfers** move money between two accounts. A transfer is two transactions pointing at each other
  (`transfer_pair`): an expense on the source account titled "Prenos na <target>" and an income on the
  target titled "Prenos sa <source>", with the same amount, date and description, in the household's
  transfer category (`is_transfer`, created as "Ostalo / Prenos" at sign-up or on the first transfer; it
  can be renamed but not switched off, and regular income or expenses can't use it). The legs show up in
  the transaction list (with `transfer`: the other leg's `id` and `account`) and change the balances, but
  stay out of income/expense totals, `breakdown/`, budgets and `suggestions/`. They are written only
  through `transfers/` (`from_account_id`, `to_account_id`, `amount`, `date`, `description`): a transfer's
  `id` is the outgoing leg's (`incoming_id` the other one's), `transfers/<id>/` accepts either leg's id, and
  a change or a delete always applies to both legs. `PATCH transactions/<leg>/` is refused (400);
  `DELETE transactions/<leg>/` deletes both legs. Renaming an account renames the legs that name it.
- `transaction_type` filters `income` / `expense` without transfers, `transfer` only transfer legs.
- `transactions/breakdown/` accepts the same filters as the list (`start_date`, `end_date`, `category`,
  `category_group`, `account`, `transaction_type`, `is_fixed`, `search`).
- `transactions/balance-history/` is the real balance per day of all accounts, or of one (`account`), from
  `start_date` (default: the first day that changes the balance, an opening date or the oldest transaction)
  to `end_date` (default: today). Every transaction counts on its date, an opening balance on its opening
  date; a transfer between two counted accounts cancels out.
- `budgets/` returns the budgets active today with `total_amount`, `total_spent` and `percentage`
  (transfer legs aren't spending); `budgets/all/?year=2026` pages through everything.

## Fitness rules worth knowing

- A training belongs to the member who logged it (one per member per day; a second one on the same
  date is a 400 on `date`). Its exercises (`TrainingItem`) appear with their first set:
  `POST trainings/{id}/sets/` (`exercise_id`, `weight` or null for bodyweight, `reps`) adds the next set
  and creates the item when needed. When the training has muscle groups, the exercise must be in one.
- `training-sets/{id}/` corrects a set (`PATCH` `weight`, `reps`) or deletes it; the remaining sets are
  renumbered 1..n. `training-items/{id}/` (`DELETE`) removes an exercise with all its sets.
- `exercises/{id}/history/` lists every training with the exercise, oldest first: sets, `max_weight`,
  `total_reps`, `volume` (`?user=` for one member). An exercise used in a training can't be deleted
  (400): deleting would erase that history.

## Nutrition rules worth knowing

- Foods are shared by the household; names are unique per household (case-insensitive). Values are
  per 100 g, whole numbers: `calories` 0-900, `protein`/`carbs`/`fat` 0-100. A food that appears in a
  consumption can't be deleted (400).
- A consumption belongs to the member who logged it; `quantity_grams` is 1-10000. Calories and macros
  of an entry are computed from the food (value per 100 g x grams / 100, rounded). The list shows the
  whole household's entries; `?user=` narrows it to one member (the web diary asks for its own).
- `consumptions/weekly-summary/?date=` returns the 7 days (Monday-Sunday) of that date's week, with
  household totals and a `by_user` row for every member (zeros included).

## Data isolation (important)

Every user belongs to a household (one is created automatically at sign-up). All domain data is scoped to
the user's active household:

- ViewSets extend `common.mixins.HouseholdModelViewSet`, which filters querysets by household and sets it on
  create. `HouseholdMixin` must stay first in the class bases, otherwise the isolation silently stops working.
- Writable foreign keys use `common.fields.HouseholdPrimaryKeyRelatedField`, so IDs from another household
  are rejected with 400.
- Objects from another household return 404.

## Languages (error messages and emails)

The API answers in the language of the request's `Accept-Language` header (Django's
`LocaleMiddleware`): English (`en`, the default, also for unsupported languages) or Serbian in Latin
script (`sr-Latn`; plain `sr` gets Latin too). The web client sends the language the user has chosen.
Translated are error messages (ours, Django's, DRF's and SimpleJWT's) and emails such as the password
reset; field names and descriptions in the OpenAPI schema stay English.

- New user-facing text in Python: wrap it in `gettext` (`from django.utils.translation import gettext
  as _`; `gettext_lazy` for module or class level constants). Put values in with named placeholders,
  never an f-string, so the translator sees the whole sentence:
  `_('Account "%(name)s" is archived.') % {"name": account.name}`.
- Translations live in `locale/sr_Latn/LC_MESSAGES/django.po`; `django.mo` is its compiled form, which
  Django reads. Both are committed. After adding or changing a message, from `api/`:

  ```bash
  python manage.py makemessages -l sr_Latn   # adds new msgids to django.po
  # translate the new entries (empty msgstr, or marked "#, fuzzy") in django.po
  python manage.py compilemessages           # django.po → django.mo
  ```

  Both need GNU gettext. On Windows: the installer from
  [gettext-iconv-windows](https://mlocati.github.io/articles/gettext-iconv-windows.html), as the Django docs
  suggest; in Docker: `apt-get install gettext` in the container.
- DRF and SimpleJWT ship no Serbian. Their messages a user can see are listed in
  `common/third_party_messages.py` (never imported, only there so `makemessages` keeps their translations).
- Checks: `common/tests/test_translations.py` (responses per language, every entry translated, `.mo` in
  sync with `.po`, placeholders kept, third-party msgids still in the installed packages); CI also runs
  `makemessages` and fails on untranslated or fuzzy entries.

## Tests

Tests live in `<app>/tests/test_*.py` and share `common.testing.HouseholdAPITestCase` (two users in two
households). Every new endpoint should get a test proving it does not leak other households' data.

```bash
python manage.py test                                     # from api/, on the host
python -m coverage run manage.py test && python -m coverage report   # with coverage (dev extras)
```

Tests use Django's runner via `common.test_runner.FastPasswordTestRunner` (`TEST_RUNNER` in settings), which
swaps in a fast password hasher. Without it the default 1M-iteration PBKDF2 makes the suite take minutes.
