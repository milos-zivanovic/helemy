import createClient, { type Middleware } from 'openapi-fetch'

import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '../auth/tokens'
import { API_URL } from '../config'
import i18n, { API_LANGUAGES, type Language } from '../i18n'
import type { paths } from './schema'

// Two typed clients built from the API's OpenAPI schema (src/api/schema.d.ts): a call that doesn't match
// the backend (path, params, body) is a TypeScript error.
//
// - publicApi: plain requests, no token. For the auth endpoints that don't need one (login, refresh,
//   register, logout, password reset), so a wrong password never triggers the refresh logic below.
// - api: everything else. Its fetch adds the access token and transparently refreshes it on a 401.
export const publicApi = createClient<paths>({ baseUrl: API_URL })
export const api = createClient<paths>({ baseUrl: API_URL, fetch: authFetch })

// The API's error messages (and emails, e.g. the password reset) come in the language of the
// request's Accept-Language header, picked by Django's LocaleMiddleware (see API_LANGUAGES).
// A middleware runs on every request of a client before it is sent (onRequest) and can change it,
// like a Django middleware's process_request. Read at request time, so a language switch applies
// to the very next call.
const languageHeader: Middleware = {
  onRequest({ request }) {
    const language = (i18n.resolvedLanguage ?? 'en') as Language
    request.headers.set('Accept-Language', API_LANGUAGES[language] ?? API_LANGUAGES.en)
    return request
  },
}
publicApi.use(languageHeader)
api.use(languageHeader)

// openapi-fetch builds a standard Request and hands it to this function instead of window.fetch, much
// like a Django middleware wraps get_response(request): code before and after the real call.
async function authFetch(request: Request): Promise<Response> {
  // After a reload there is a refresh token but no access token yet: get one first instead of sending
  // a request that is sure to fail with 401.
  if (getAccessToken() === null && getRefreshToken() !== null) await refreshAccessToken()

  // A Request body can be read only once, so keep a copy for a possible retry.
  const retry = request.clone()
  const usedToken = getAccessToken()
  const response = await fetch(withAccessToken(request))
  if (response.status !== 401 || getRefreshToken() === null) return response

  // 401: the access token expired. If a parallel request already refreshed it, just retry; otherwise
  // refresh now. If the refresh fails the user is logged out and the original 401 is returned.
  if (getAccessToken() === usedToken && !(await refreshAccessToken())) return response
  return fetch(withAccessToken(retry))
}

function withAccessToken(request: Request): Request {
  const token = getAccessToken()
  if (token !== null) request.headers.set('Authorization', `Bearer ${token}`)
  return request
}

// Several requests can hit a 401 at the same moment (a page loads three lists at once). They must share
// ONE refresh: the API rotates refresh tokens and blacklists the old one, so a second refresh with the
// same token would fail and log the user out. The promise of the running refresh is reused until it ends.
let pendingRefresh: Promise<boolean> | null = null

export function refreshAccessToken(): Promise<boolean> {
  pendingRefresh ??= doRefresh().finally(() => {
    pendingRefresh = null
  })
  return pendingRefresh
}

async function doRefresh(): Promise<boolean> {
  const refresh = getRefreshToken()
  if (refresh === null) return false

  // A network error throws here and reaches the caller as a failed request; the user stays logged in.
  const { data, response } = await publicApi.POST('/api/auth/token/refresh/', { body: { refresh } })
  if (data) {
    setTokens({ access: data.access, refresh: data.refresh })
    return true
  }
  // Another tab may have rotated the token while this request was in flight: try again with its token.
  if (getRefreshToken() !== refresh) return doRefresh()
  // The token is invalid, expired or blacklisted: the session is over.
  if (response.status === 400 || response.status === 401) clearTokens()
  return false
}
