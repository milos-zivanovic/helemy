// Origin of the API, without the /api prefix: the generated paths already start with /api/.
// Default: the dev server talks to the API on localhost:8000; a production build calls its own origin
// ('' = relative URLs like /api/...), where nginx forwards /api to the API container.
export const API_URL =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:8000')
