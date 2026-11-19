// @vitest-environment jsdom
// ↑ tokens.ts uses window and localStorage, which plain Node doesn't have; jsdom provides them.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '../auth/tokens'
import i18n from '../i18n'
import { api, publicApi } from './client'

// The API is replaced by a fake server behind a mocked fetch(). It behaves like SimpleJWT with
// ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION: every refresh returns a new pair and the old
// refresh token stops working, which is exactly why parallel refreshes must be shared.
//
// vi.hoisted runs before the imports above: openapi-fetch's publicApi captures globalThis.fetch when
// client.ts is imported, so the mock has to be in place by then.
const fetchMock = vi.hoisted(() => {
  const mock = vi.fn<(request: Request) => Promise<Response>>()
  vi.stubGlobal('fetch', mock)
  return mock
})

const REFRESH_PATH = '/api/auth/token/refresh/'

const server = {
  access: '',
  refresh: '',
  issued: 0,
  /** Runs at the start of each refresh call (to simulate another tab, a slow network...). */
  beforeRefresh: async () => {},
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handle(request: Request): Promise<Response> {
  if (new URL(request.url).pathname === REFRESH_PATH) {
    const { refresh } = (await request.json()) as { refresh: string }
    await server.beforeRefresh()
    if (refresh !== server.refresh) return json(401, { code: 'token_not_valid' })
    server.issued += 1
    server.access = `access-${server.issued}`
    server.refresh = `refresh-${server.issued}`
    return json(200, { access: server.access, refresh: server.refresh })
  }
  return request.headers.get('Authorization') === `Bearer ${server.access}`
    ? json(200, [])
    : json(401, { code: 'token_not_valid' })
}

const requests = () => fetchMock.mock.calls.map(([request]) => request)
const refreshCalls = () => requests().filter((r) => new URL(r.url).pathname === REFRESH_PATH)
const dataCalls = () => requests().filter((r) => new URL(r.url).pathname !== REFRESH_PATH)

/** Any authenticated endpoint will do: the fake server answers them all the same way. */
const listAccounts = () => api.GET('/api/finances/accounts/')

beforeEach(() => {
  clearTokens()
  fetchMock.mockReset()
  fetchMock.mockImplementation(handle)
  Object.assign(server, { access: 'access-0', refresh: 'refresh-0', issued: 0 })
  server.beforeRefresh = async () => {}
})

describe('api client', () => {
  it('sends the access token', async () => {
    setTokens({ access: 'access-0', refresh: 'refresh-0' })

    const { response } = await listAccounts()

    expect(response.status).toBe(200)
    expect(dataCalls()[0].headers.get('Authorization')).toBe('Bearer access-0')
    expect(refreshCalls()).toHaveLength(0)
  })

  it('after a reload, gets an access token before the first request', async () => {
    localStorage.setItem('refreshToken', 'refresh-0') // only the refresh token survives a reload

    const { response } = await listAccounts()

    expect(response.status).toBe(200)
    expect(refreshCalls()).toHaveLength(1)
    expect(dataCalls()).toHaveLength(1) // no request that was sure to fail with 401
    expect(getAccessToken()).toBe('access-1')
    expect(getRefreshToken()).toBe('refresh-1') // the rotated token is stored
  })

  it('refreshes an expired access token and retries the request', async () => {
    setTokens({ access: 'expired', refresh: 'refresh-0' })

    const { response } = await listAccounts()

    expect(response.status).toBe(200)
    expect(refreshCalls()).toHaveLength(1)
    expect(dataCalls().map((r) => r.headers.get('Authorization'))).toEqual([
      'Bearer expired',
      'Bearer access-1',
    ])
  })

  it('shares one refresh between parallel requests that all get 401', async () => {
    setTokens({ access: 'expired', refresh: 'refresh-0' })
    // A slow refresh, so all three 401s arrive while it is still running.
    server.beforeRefresh = () => new Promise((resolve) => setTimeout(resolve, 20))

    const results = await Promise.all([listAccounts(), listAccounts(), listAccounts()])

    expect(results.map(({ response }) => response.status)).toEqual([200, 200, 200])
    // A second refresh with refresh-0 would be rejected (blacklisted) and log the user out.
    expect(refreshCalls()).toHaveLength(1)
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('retries with the new token when another tab rotated it during the refresh', async () => {
    setTokens({ access: 'expired', refresh: 'refresh-0' })
    let otherTabDone = false
    server.beforeRefresh = async () => {
      if (otherTabDone) return
      otherTabDone = true
      // Another tab refreshes first: refresh-0 is now blacklisted and localStorage has the new token.
      server.refresh = 'from-other-tab'
      localStorage.setItem('refreshToken', 'from-other-tab')
    }

    const { response } = await listAccounts()

    expect(response.status).toBe(200)
    expect(refreshCalls()).toHaveLength(2)
    expect(getRefreshToken()).toBe('refresh-1') // still logged in
  })

  it('logs out when the refresh token is rejected and returns the original 401', async () => {
    setTokens({ access: 'expired', refresh: 'blacklisted' })

    const { response } = await listAccounts()

    expect(response.status).toBe(401)
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('stays logged in when the refresh fails because of the network', async () => {
    setTokens({ access: 'expired', refresh: 'refresh-0' })
    server.beforeRefresh = () => Promise.reject(new TypeError('Failed to fetch'))

    await expect(listAccounts()).rejects.toThrow('Failed to fetch')
    expect(getRefreshToken()).toBe('refresh-0')
  })

  it("doesn't try to refresh without a refresh token", async () => {
    const { response } = await listAccounts()

    expect(response.status).toBe(401)
    expect(refreshCalls()).toHaveLength(0)
    expect(dataCalls()[0].headers.get('Authorization')).toBeNull()
  })

  it.each([
    ['sr', 'sr-latn'],
    ['en', 'en'],
  ])('asks for API messages in the app language (%s → %s)', async (language, header) => {
    await i18n.changeLanguage(language)

    await listAccounts() // the authenticated client
    await publicApi.POST('/api/auth/token/', { body: { email: 'a@example.com', password: 'x' } })

    expect(requests().map((request) => request.headers.get('Accept-Language'))).toEqual([
      header,
      header,
    ])
  })
})
