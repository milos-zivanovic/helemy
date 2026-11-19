// Starts the Django API for the end-to-end tests, like Django's LiveServerTestCase: a fresh
// SQLite database every run, migrated, then runserver. Playwright starts this script before the
// tests (webServer in playwright.config.ts) and stops it afterwards.
//
// Usage: node e2e/api-server.mjs <port> <web origin allowed by CORS>
// Python: the repo's .venv, or E2E_PYTHON to point at another interpreter.

import { spawn, spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const [port, webOrigin] = process.argv.slice(2)
if (!port || !webOrigin) {
  console.error('Usage: node e2e/api-server.mjs <port> <web origin>')
  process.exit(1)
}

const apiDir = resolve(import.meta.dirname, '../../api')
const python =
  process.env.E2E_PYTHON ??
  resolve(apiDir, '../.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')

// Outside the repo, and never api/data/: the tests must not touch a real database.
const database = join(tmpdir(), 'life-tracker-e2e.sqlite3')
rmSync(database, { force: true })

// Set explicitly, so these win over anything in api/.env (django-environ only fills in variables
// that are not already set).
const env = {
  ...process.env,
  DATABASE_URL: `sqlite:///${database.replaceAll('\\', '/')}`,
  SECRET_KEY: 'e2e-tests-only-not-a-secret-at-least-32-bytes', // HS256 wants 32+
  DEBUG: 'True',
  ALLOWED_HOSTS: '127.0.0.1,localhost',
  CORS_ALLOWED_ORIGINS: webOrigin,
  EMAIL_URL: 'consolemail://',
}

const migrate = spawnSync(python, ['manage.py', 'migrate', '--noinput'], {
  cwd: apiDir,
  env,
  stdio: 'inherit',
})
if (migrate.status !== 0) process.exit(migrate.status ?? 1)

// --noreload: one process, so stopping this script really stops the server.
const server = spawn(python, ['manage.py', 'runserver', `127.0.0.1:${port}`, '--noreload'], {
  cwd: apiDir,
  env,
  stdio: 'inherit',
})
server.on('exit', (code) => process.exit(code ?? 0))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
