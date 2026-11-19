import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { api, publicApi } from '../api/client'
import { API_LANGUAGES, type Language } from '../i18n'
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
 * Keeps the user's saved language (User.language on the API) equal to the one the app shows: after
 * login and after every switch. The API needs it for what doesn't answer one of the user's own
 * requests (e.g. an email triggered by another member); answers to requests follow Accept-Language.
 * The device used last wins.
 */
export function useSyncLanguage() {
  const { i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const shown = API_LANGUAGES[(i18n.resolvedLanguage ?? 'sr') as Language] ?? API_LANGUAGES.sr
  const saved = me?.language

  // useEffect runs after React has rendered, whenever a value in the dependency list changed: the
  // place for side effects such as an API call (rendering itself must not have any).
  useEffect(() => {
    if (saved === undefined || saved === shown) return // not loaded yet, or already in sync
    void api.PATCH('/api/auth/me/', { body: { language: shown } }).then(({ data }) => {
      // The answer is the whole profile: put it in the cache instead of fetching it again.
      if (data) queryClient.setQueryData(ME_QUERY_KEY, data)
    })
  }, [saved, shown, queryClient])
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
