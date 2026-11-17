import createClient from 'openapi-fetch'

import { API_URL } from '../config'
import type { paths } from './schema'

// Typed fetch wrapper: paths, query params, bodies and responses all come from the API's OpenAPI
// schema (src/api/schema.d.ts), so a call that doesn't match the backend is a TypeScript error.
export const api = createClient<paths>({ baseUrl: API_URL })
