// Token storage. The access token lives only in memory (a variable in this module): it is short-lived
// (15 min) and gets lost on reload, which is fine because the refresh token gets a new one. The refresh
// token is kept in localStorage so a reload or a new tab doesn't log the user out.
//
// "Logged in" means "has a refresh token". React components follow it through subscribe() (see
// useIsLoggedIn in ./useAuth.ts), so a login, a logout or a failed refresh re-renders them.

const REFRESH_TOKEN_KEY = 'refreshToken'

let accessToken: string | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    return null // storage blocked (private mode, browser settings)
  }
}

export function setTokens(tokens: { access: string; refresh: string }) {
  accessToken = tokens.access
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh)
  } catch {
    // Without storage the session lasts until the tab is closed; nothing else to do.
  }
  notify()
}

export function clearTokens() {
  accessToken = null
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // ignore, see getRefreshToken
  }
  notify()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Another tab logged out (or in): localStorage is shared between tabs and the browser fires a
// "storage" event in every other tab. Drop our access token if the refresh token is gone.
window.addEventListener('storage', (event) => {
  if (event.key !== REFRESH_TOKEN_KEY && event.key !== null) return
  if (getRefreshToken() === null) accessToken = null
  notify()
})
