import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { api, publicApi } from '../api/client'
import { API_LANGUAGES, fromApiLanguage, type Language } from '../i18n'
import { clearTokens, getRefreshToken, subscribe } from './tokens'

export const ME_QUERY_KEY = ['me'] as const

/** True while a refresh token exists. Re-renders on login, logout and a failed refresh (any tab). */
export function useIsLoggedIn(): boolean {
  // useSyncExternalStore lets React read a value that lives outside React (our tokens module) and
  // re-render whenever that module calls its listeners.
  return useSyncExternalStore(subscribe, () => getRefreshToken() !== null)
}

/** The logged-in user's profile (GET /api/auth/me/), cached by TanStack Query. */
export function useMe() {
  const isLoggedIn = useIsLoggedIn()
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/auth/me/')
      if (!data) throw new Error(`GET /api/auth/me/ failed with ${response.status}`)
      return data
    },
    enabled: isLoggedIn, // don't even try without a session
  })
}

/**
 * The language is the user's own (User.language on the API), not the browser's: every user sees
 * the app in their language, on any device, whoever used the browser before them.
 * - The account wins when the profile loads (after login, on reload) and when it changed on
 *   another device (the profile is fetched again, e.g. when the tab gets focus): the app switches.
 * - A switch in the app (LanguageSwitcher) is saved on the account (PATCH /api/auth/me/).
 * Logged out (login, sign up...) the language is the browser's: the last one picked there, else
 * the browser's own. Sign up stores the language it was done in (Accept-Language) on the account.
 * Used only in AppLayout, which unmounts on logout, so the next login starts over.
 */
export function useSyncLanguage() {
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const shown = API_LANGUAGES[(i18n.resolvedLanguage ?? 'en') as Language] ?? API_LANGUAGES.en
  const saved = me?.language
  // The account's language as this tab last agreed on it; null until the profile first loads.
  // useRef is a value that survives re-renders without causing one (like an instance attribute).
  const synced = useRef<string | null>(null)

  // useEffect runs after React has rendered, whenever a value in the dependency list changed: the
  // place for side effects such as an API call (rendering itself must not have any).
  useEffect(() => {
    if (saved === undefined) return // profile not loaded yet
    const savedInApp = fromApiLanguage(saved)
    if (savedInApp !== undefined && saved !== synced.current) {
      // First load, or changed elsewhere: the account wins. The switch re-renders with the new
      // `shown`, which equals `saved`, so nothing is sent back.
      synced.current = saved
      if (saved !== shown) void i18n.changeLanguage(savedInApp)
      return
    }
    if (saved === shown) return // in sync
    // Switched in the app (or the account has a language the app doesn't know): save it.
    synced.current = shown
    void api.PATCH('/api/auth/me/', { body: { language: shown } }).then(({ data }) => {
      // The answer is the whole profile: put it in the cache instead of fetching it again.
      if (data) queryClient.setQueryData(ME_QUERY_KEY, data)
    })
  }, [saved, shown, i18n, queryClient])
}

/** Log out: forget the tokens and all cached data, then blacklist the refresh token on the API. */
export function useLogout() {
  const queryClient = useQueryClient()
  return async () => {
    const refresh = getRefreshToken()
    clearTokens() // the protected layout sees this and redirects to /login right away
    queryClient.clear() // the next user must not see this user's cached data
    if (refresh !== null) {
      // Best effort: if it fails, the token simply expires on its own (JWT_REFRESH_TOKEN_LIFETIME_DAYS).
      await publicApi.POST('/api/auth/logout/', { body: { refresh } }).catch(() => undefined)
    }
  }
}
