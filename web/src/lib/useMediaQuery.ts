import { useSyncExternalStore } from 'react'

/**
 * True while a CSS media query matches, e.g. useMediaQuery('(min-width: 1024px)'). The browser
 * tells us when it starts or stops matching (window resize, phone rotation) and React re-renders,
 * the same mechanism as useIsLoggedIn: a value outside React, read with useSyncExternalStore.
 * Use it when the two cases need different components; for different styles, Tailwind's
 * breakpoint prefixes (sm:, lg:) are enough.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

/** Tailwind's `lg` breakpoint: from here on the app has a sidebar instead of the phone bars. */
export const DESKTOP = '(min-width: 1024px)'
