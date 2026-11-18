# web — Life Tracker web client

> **Status:** phases 1-5 (auth, household, finances, fitness, nutrition, Docker) done.

Browser client for Life Tracker. It uses only the REST API in [`../api`](../api/README.md) and never touches
the database directly.

## Stack

| Tool                               | Role                                                            |
| ---------------------------------- | --------------------------------------------------------------- |
| React + TypeScript                 | UI and language                                                 |
| Vite                               | Dev server and production build                                 |
| TanStack Query                     | Calling the API, caching, loading/error states                  |
| openapi-fetch + openapi-typescript | Typed API client; types generated from the API's OpenAPI schema |
| React Router                       | Routes (URL → page), public and protected layouts               |
| React Hook Form + Zod              | Forms and their client-side validation                          |
| i18next + react-i18next            | Translations (Serbian Latin `sr`, English `en`)                 |
| Tailwind CSS                       | Styling                                                         |
| Recharts                           | Charts (only the reports page; loaded on demand)                |
| oxlint, Prettier                   | Linting and formatting                                          |
| Vitest (+ jsdom)                   | Unit tests                                                      |
| Playwright                         | End-to-end smoke test in a real browser                         |

Code shared with the mobile app (API client, types,
query hooks) will move to a shared package once both clients exist.

## Requirements

Node.js LTS (installed here with [fnm](https://github.com/Schniz/fnm)). On Windows PowerShell, if `npm`
fails with "running scripts is disabled on this system", allow local scripts once:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Running

The API must be running on http://localhost:8000. Start only the API in Docker, because the `dev` profile's
`web-dev` would take port 3000 (from `infrastructure/`: `docker compose --profile dev up -d api-dev`), or
skip this section and run both in Docker (below).

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Port 3000 is fixed (`strictPort`) because the API allows exactly this origin through `CORS_ALLOWED_ORIGINS`.

### With Docker

`docker compose --profile dev up -d --build` (from `infrastructure/`) starts the API and this dev server
(`web-dev`) together; see [infrastructure/README.md](../infrastructure/README.md). The source is mounted,
so edits reload as on the host; `node_modules` is the image's own (Linux binaries). After changing
`package.json`, rebuild with fresh volumes: `docker compose --profile dev up -d --build -V web-dev`.
With `--profile dev-pg` the same dev server runs as `web-dev-pg` and calls the PostgreSQL API on :8001.

The `prod` profile builds the app ([`Dockerfile`](Dockerfile), target `prod`) and serves it with nginx
([`nginx.conf`](nginx.conf)) on http://localhost:8080. nginx forwards `/api/`, `/admin/`, `/static/` and
`/media/` to the API container, so the browser sees one origin: no CORS, and the build calls relative
URLs (`/api/...`). Unknown paths get `index.html`, so a reload on `/finances/reports` works; hashed files in
`/assets/` are cached for a year, `index.html` never.

## Scripts

| Command                           | What it does                                                             |
| --------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                     | Dev server with hot reload on port 3000                                  |
| `npm run build`                   | Type check, then production build into `dist/`                           |
| `npm run preview`                 | Serve the `dist/` build locally                                          |
| `npm run typecheck`               | TypeScript only (`tsc -b`)                                               |
| `npm run lint`                    | oxlint                                                                   |
| `npm run format` / `format:check` | Prettier (also sorts Tailwind classes)                                   |
| `npm run test` / `test:watch`     | Vitest: run the unit tests once / re-run them on every change            |
| `npm run test:e2e`                | Playwright smoke test in a real browser (starts its own API and web app) |
| `npm run gen:api`                 | Regenerate `src/api/schema.d.ts` from http://localhost:8000/api/schema/  |

Run `typecheck`, `lint`, `format:check`, `test` and `build` before finishing a change.

### Tests

Unit tests sit next to the code they test (`dates.ts` → `dates.test.ts`). They cover logic that can break
silently, not the UI:

| Test file                      | What it checks                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/client.test.ts`       | Token handling against a fake API: refresh on 401, one shared refresh for parallel requests, token rotated by another tab, logout when the refresh token is rejected |
| `src/finances/schemas.test.ts` | Form validation and the transform to the API payload (amount parsing, date ranges, yearly category windows, transfers)                                               |
| `src/lib/dates.test.ts`        | Local-time date helpers (month ranges, month/day shifts, URL date validation)                                                                                        |
| `src/api/errors.test.ts`       | DRF error bodies → messages and form field errors                                                                                                                    |
| `src/i18n/locales.test.ts`     | `sr.json` and `en.json` have the same keys and `{{placeholders}}`                                                                                                    |

Tests run in Node; a file that needs browser APIs (`window`, `localStorage`) starts with
`// @vitest-environment jsdom`.

### End-to-end smoke test

`npm run test:e2e` runs `e2e/smoke.e2e.ts` in Chromium against the real app: sign up, create a savings
account, add an income and an expense, transfer to the savings account, check the totals and balances on
the transaction list, the accounts page and the home page, then log out and back in. Playwright starts
both servers itself (`webServer` in `playwright.config.ts`) and stops them afterwards:

- the API on http://127.0.0.1:8010 via `e2e/api-server.mjs`: the repo's `.venv` (or `E2E_PYTHON`), a
  fresh SQLite database in the system temp folder every run (never `api/data/`), migrations, `runserver`
- the web dev server on http://127.0.0.1:3010, pointed at that API

Other ports than the dev setup, so a running `npm run dev` or Docker stack doesn't get in the way. First
time only: `npx playwright install chromium` downloads the browser. The test finds elements by the text
the user sees, taken from `sr.json` (`e2e/i18n.ts`), so it survives layout changes and reworded labels;
it needs an update only when the flow itself changes. On a failure, `test-results/` has a screenshot and
a trace: `npx playwright show-trace test-results/<test>/trace.zip` replays every step.

### API types

`src/api/schema.d.ts` is generated, never edited by hand, and committed so a build doesn't need a running API.
After any change to the API (endpoint, serializer field, filter), start the API and run `npm run gen:api`;
TypeScript then reports every place in the web code that no longer matches. The generator runs through
`npx` with a pinned version because it needs TypeScript 5 while the project uses TypeScript 7.

## Auth

- **Tokens**: the access token is kept only in memory, the refresh token in `localStorage` (key
  `refreshToken`), so a reload or a new tab keeps the session. "Logged in" means a refresh token exists.
- **Refresh**: `api` (in `src/api/client.ts`) adds `Authorization: Bearer …` to every request. On a 401 it
  refreshes the access token once and repeats the request; parallel 401s share one refresh, because the API
  rotates refresh tokens and blacklists the old one. If the refresh fails, the tokens are dropped and the
  user lands on `/login`. After a reload the first request refreshes before it is sent.
- **Clients**: `publicApi` sends no token and is used for the endpoints that don't need one (login, refresh,
  sign up, logout, password reset), so a wrong password never triggers a refresh.
- **Routes**: `AuthLayout` frames the public pages and sends a logged-in user into the app (back to the page
  they first asked for); `AppLayout` sends a logged-out user to `/login` and loads `GET /api/auth/me/`.
- **Language**: every request carries the app's language in `Accept-Language` (`sr-latn` / `en`, see
  `API_LANGUAGES` in `src/i18n/index.ts`), so API errors come translated. `useSyncLanguage` (in `AppLayout`)
  saves it on the account with `PATCH /api/auth/me/` after login and after every switch; the device used
  last wins.
- **Logout** drops both tokens and the whole query cache, then blacklists the refresh token on the API.
- **Password change** (`/profile`): the API logs out every session and returns a new token pair, which
  replaces the stored one; other tabs of the same browser keep working because they share `localStorage`.
- **Password reset**: the API emails a link to `/reset-password?uid=…&token=…` (`PASSWORD_RESET_URL`). In
  development the email is printed to the API log (`docker compose --profile dev logs api-dev`).

| Route                         | Page                                                   |
| ----------------------------- | ------------------------------------------------------ |
| `/login`                      | Log in                                                 |
| `/register`                   | Sign up (logged in right away)                         |
| `/forgot-password`            | Ask for a reset email                                  |
| `/reset-password`             | Set a new password from the email's link               |
| `/`                           | Start page: summary of finances, trainings, nutrition  |
| `/household`                  | Household: details, members, invitations               |
| `/profile`                    | Account data and password change                       |
| `/finances/transactions`      | Main screen: period, filters, totals, list or chart    |
| `/finances/transactions/new`  | New expense, income or transfer (`?type=transfer`)     |
| `/finances/transactions/:id`  | Edit or delete a transaction                           |
| `/finances/accounts`          | Total balance and accounts                             |
| `/finances/accounts/new`      | New account (opening balance and date)                 |
| `/finances/accounts/:id`      | Edit, archive or delete an account                     |
| `/finances/transfers/:id`     | Edit or delete a transfer (either half's id)           |
| `/finances/categories`        | Category groups and their categories                   |
| `/finances/categories/new`    | New category (`?group=` preselects the group)          |
| `/finances/categories/:id`    | Edit or delete a category                              |
| `/finances/budgets`           | Budgets active today, all budgets of a year            |
| `/finances/budgets/new`       | New budget (quick periods: this/next month, this year) |
| `/finances/budgets/:id`       | Edit or delete a budget                                |
| `/finances/reports`           | Totals, breakdown by group/category, balance over time |
| `/fitness/trainings`          | Trainings, newest first                                |
| `/fitness/trainings/new`      | New training (date, name, muscle groups)               |
| `/fitness/trainings/:id`      | The training: exercises, sets, last time's result      |
| `/fitness/trainings/:id/edit` | Edit the training's date, name, muscle groups, notes   |
| `/fitness/exercises`          | Exercises by muscle group                              |
| `/fitness/exercises/new`      | New exercise                                           |
| `/fitness/exercises/:id`      | Progress of the exercise, edit or delete it            |
| `/nutrition/diary`            | Diary of a day (`?date=`, default today) and its week  |
| `/nutrition/foods`            | Foods with values per 100 g, searchable                |
| `/nutrition/foods/new`        | New food                                               |
| `/nutrition/foods/:id`        | Edit or delete a food                                  |

API error messages (field errors from a 400) come from the API in English.

## Household

`/household` shows the active household (`me.households[0]`; a user is in exactly one), its members and
the invitations. The owner renames it, invites people by email (they need an account; nothing is emailed,
the invitation shows up in their app), withdraws invitations and removes members. A member can leave.
Received invitations show up on the same page, with a badge in the navigation; the list is refreshed every
minute and when the tab gets focus. Accepting an invitation or leaving switches the active household, so
the whole query cache is refetched.

## Start page

`/` sums up every section, each card linking to its details: finances (total balance, each open account,
this month's income, expenses and balance), budgets at 80 % or more (only when there are any), fitness
(trainings this month, the last training) and nutrition (the logged-in member's calories and macros today).

## Finances

Tabs: **Budgets**, **Transactions** (the main screen, where `/finances` opens), **Reports** and
**Settings**, which groups the pages set up once and opened rarely: Accounts and Categories
(`src/finances/FinancesLayout.tsx`; their URLs don't change).

- **Accounts** (`/finances/accounts`): where the money is. The page leads with the total balance and
  lists the accounts (today's balance from the API, archived ones apart). An account's balance is its
  opening balance (from its date) plus all its transactions, transfers and old ones included. Every
  transaction picks an account (a new one defaults to the first active account).
- **Transfers** (e.g. a cash withdrawal) move money between two accounts. The API stores one as two
  linked transactions: out of one account, into the other, in the "Prenos" category (see the API README).
  So a transfer is in the transaction list twice, once under each account, in neutral grey ("⇄ Transfer
  to Savings −1,000" / "⇄ Transfer from Current +1,000"), and changes the balances without counting as
  income or expenses. Either half opens the transfer form (`/finances/transfers/:id`), where a change or
  a delete applies to both halves.
- **Transactions** (`/finances/transactions`): the main screen, like the old wallet's overview. On top the
  total balance of all accounts and a button for a new entry. The period is all transactions by
  default, with quick choices (all, this month, last month, this year), a month stepper when the period is
  one calendar month, and a free from–to range. Filters: type, group, category (only the chosen group's),
  account, fixed costs, search. Everything lives in the URL (`start`, `end`, `type`, `group`, `category`,
  `account`, `fixed`, `q`, `view`), so reload, bookmarks and the back button keep it. The totals come
  from the API and cover every transaction matching the filters, not only the rows loaded so far. The list
  shows 50 rows and grows with "Load more" (also by itself when the button scrolls into view:
  `useInfiniteQuery` + an `IntersectionObserver`). The type filter has a third option, transfers. With
  an account filter a "Transfers" tile shows the net of the transfers into and out of it, and the balance
  includes it (without one they cancel out). `view=chart` shows the
  same filtered transactions as ranked bars per group (expenses unless the type is income); a group's bar
  opens its categories, a category's bar opens its transactions in the list.
- **Form**: the toggle on top picks expense, income or transfer; a transfer swaps the form for the
  transfer one (from, to, amount, date, description) and keeps what was typed in the shared fields.
  Typing a title (2+ characters) suggests earlier transactions; picking one fills type, category, fixed
  flag and the last amount. The category list shows only categories active on the chosen date (an edited
  transaction keeps its own category even if it's archived), never the transfer category. Amounts accept
  `1250,50` or `1250.50`.
- **Categories** (`/finances/categories`): groups are created, renamed, switched off and deleted in place;
  a category has its own form with an optional one-off period and an optional yearly window. A category
  is usable on a day when it and its group are switched on and the day fits both ranges (`active_today`
  in the list). Anything that still has transactions can't be deleted, only switched off. The transfer
  category (badge "For transfers") can be renamed or moved, but has no switch and no periods.
- **Budgets** (`/finances/budgets`): a limit for one category over a period. The page shows the budgets
  running today with an overall total, then all budgets of a year (`?year=`). Spent is the sum of the
  category's expenses in the period; the bar turns amber at 80 % and red above 100 %. A category can't
  have two budgets with overlapping periods.
- **Reports** (`/finances/reports?start=&end=&type=&group=&account=`): one period scopes the whole
  page: the totals, the breakdown (ranked bars per group; a group opens its categories) and the account
  balance (all accounts or one; a line chart that stops at today, with a table view). The page and Recharts are a separate chunk
  (`lazy` route), downloaded only when the page is opened.
- **Dates** are `YYYY-MM-DD` strings handled in local time (`src/lib/dates.ts`); never `toISOString()`,
  which converts to UTC and can shift the day. Money and dates are formatted with `useFormatters()`
  in the user's currency and the app's language.

## Fitness

- **Trainings** (`/fitness/trainings`): the household's trainings, newest first. A new training asks
  for the date, an optional name and muscle groups, then opens the training page.
- **Training page** (`/fitness/trainings/:id`): one card per exercise with its sets, the member's
  previous result for that exercise ("last time") and an "add set" row prefilled with the last set, so
  a repeated set is one tap. Sets can be corrected or deleted (the rest are renumbered). A new exercise
  is added with its first set; only exercises of the training's muscle groups are offered. Weight is
  optional (bodyweight exercises).
- **Exercises** (`/fitness/exercises`): grouped by muscle group. The exercise page shows the user's
  progress (heaviest set per training, or total reps for bodyweight exercises) as headline numbers, a
  line chart and the list of trainings. The progress component is loaded with `React.lazy`, so Recharts
  is downloaded only when it's shown. An exercise used in trainings can't be deleted.

## Nutrition

- **Diary** (`/nutrition/diary`): the logged-in member's entries of one day (arrows switch days, the
  day is in the URL), the day's calories and macros, and a Monday-Sunday table of the week (a row
  opens that day). Adding an entry: search a food by name (the API's `?search=`), enter grams; the
  approximate kcal is shown before saving. Grams of an entry can be corrected in place. The diary is
  personal: it asks for `?user=<me>` and reads the member's own row of the weekly summary.
- **Foods** (`/nutrition/foods`): shared by the household, values per 100 g as whole numbers (kcal
  0-900, macros 0-100 g). A food that is in someone's diary can't be deleted.

## Data loading

TanStack Query: `useQuery` for reads, `useMutation` for writes. Every query has a key (`['me']`,
`['invitations']`, `['households', id, 'members']`); after a write the mutation invalidates the keys
whose data it changed and those queries refetch. `unwrap()` (`src/api/errors.ts`) turns a non-2xx
openapi-fetch result into a thrown `ApiError`, which is how TanStack Query learns that a call failed;
`errorMessage()` and `showMutationError()` turn it into text for an alert or a form.

## Configuration

Optional; put it in `web/.env.local` (gitignored). Only variables starting with `VITE_` reach the browser code.

| Variable       | Default                                          | Meaning                                                                    |
| -------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| `VITE_API_URL` | dev: `http://localhost:8000`, build: same origin | Origin of the API, without `/api` (the generated paths start with `/api/`) |

## Structure

```
web/src/
├── main.tsx               # Entry point: i18n, React Query provider, router
├── router.tsx             # Routes: URL → layout + page
├── config.ts              # Values from the environment (API_URL)
├── api/
│   ├── client.ts          # Typed clients (openapi-fetch): `api` with token + refresh, `publicApi`
│   ├── errors.ts          # ApiError, unwrap(); DRF errors → alerts and form fields
│   ├── types.ts           # Short names for the generated API types (User, Household, ...)
│   ├── queryClient.ts     # TanStack Query cache settings
│   └── schema.d.ts        # Generated by `npm run gen:api`
├── auth/
│   ├── tokens.ts          # Access token in memory, refresh token in localStorage
│   ├── useAuth.ts         # useIsLoggedIn, useMe, useLogout
│   └── schemas.ts         # Zod schemas of the auth forms
├── finances/              # Finance hooks, schemas, transaction form, section layout
├── fitness/               # Fitness hooks, schemas, training cards, progress chart, section layout
├── nutrition/             # Nutrition hooks, schemas, food search box, section layout
├── household/             # Household hooks (queries, mutations) and page sections
├── layouts/               # AuthLayout (public pages), AppLayout (logged-in pages, navigation)
├── lib/                   # Plain helpers: local dates, useDebouncedValue
├── pages/                 # One component per route
├── i18n/
│   ├── format.ts          # useFormatters(): dates and money in the current language (Intl)
│   ├── index.ts           # i18next setup: sr (default) + en, choice remembered in localStorage
│   ├── i18next.d.ts       # Makes translation keys type-checked against sr.json
│   └── locales/           # sr.json, en.json: every key must exist in both
├── assets/                # Images imported from code (logo.png; hashed file names in the build)
└── components/            # Reusable UI pieces (Brand: logo + app name in both layouts)
```

`public/` holds files served as they are, at the site root: `favicon.png` and `apple-touch-icon.png`.
All logo sizes are made from the master logo in [`../branding/`](../branding/README.md).

## Next phases

1. ~~Auth~~ (done)
2. ~~App shell and household~~ (done)
3. ~~Finances~~ (done)
4. ~~Fitness and nutrition~~ (done)
5. ~~Docker~~ (done): `web-dev` in the `dev` profile, `web-prod` (nginx) in `prod`
