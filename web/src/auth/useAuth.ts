import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { api, publicApi } from '../api/client'
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
