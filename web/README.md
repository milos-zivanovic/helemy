# web — Life Tracker web client (planned)

> **Status:** not started. This folder is empty apart from this README.

Browser client for Life Tracker. It will use only the REST API in [`../api`](../api/README.md) and will
not access the database directly.

## Planned stack

| Tool | Role |
|---|---|
| React + TypeScript | UI and language |
| Vite | Dev server and production build |
| React Router | Client-side routes |
| TanStack Query | Calling the API, caching, loading/error states |
| React Hook Form + Zod | Forms and validation |
| Tailwind CSS | Styling |
| Recharts | Charts (spending by category, balance over time) |

API types will be generated from the OpenAPI schema (`/api/schema/`) so the client always matches the
backend. Code shared with the mobile app (API client, types, query hooks) will move to a shared package
once both clients exist.

## Planned way to run

Development server on **http://localhost:3000**. The API already allows this origin through
`CORS_ALLOWED_ORIGINS`.

On the host (fastest feedback while developing):

```bash
cd web
npm install
npm run dev -- --port 3000
```

Through Docker, once a `web-dev` service is added to `../infrastructure/docker-compose.yml`:

```bash
cd infrastructure
docker compose --profile dev up -d --build    # API + web together
```

## Configuration (planned)

| Variable | Example | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000/api` | Base URL of the API |

## First steps when starting

1. `npm create vite@latest web -- --template react-ts` from the repo root
2. Login screen: `POST /api/auth/token/`, keep the tokens, refresh on 401
3. Transactions: list with filters, create/edit form, totals
4. Budgets and charts
