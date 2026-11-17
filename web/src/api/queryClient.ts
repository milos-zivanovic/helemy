import { QueryClient } from '@tanstack/react-query'

// One cache for the whole app. Data younger than staleTime is served from the cache without a new
// request; older data is still shown at once and refreshed in the background.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
