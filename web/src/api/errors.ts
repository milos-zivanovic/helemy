import type { TFunction } from 'i18next'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

// The server-side error message shown above a form (not tied to one field).
export const ROOT_ERROR = 'root.server'

/** A non-2xx API response, thrown by unwrap() so TanStack Query treats it as a failed query/mutation. */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(`API request failed with ${status}`)
    this.status = status
    this.body = body
  }
}

/**
 * Turn an openapi-fetch result into its data, or throw ApiError. openapi-fetch never throws for HTTP
 * errors (only for network failures), while TanStack Query needs a thrown error to know a call failed.
 */
export function unwrap<D>(result: { data?: D; error?: unknown; response: Response }): D {
  if (!result.response.ok) throw new ApiError(result.response.status, result.error)
  return result.data as D // undefined for 204 No Content
}

/** One human-readable message for any error thrown by an API call (for alerts next to buttons). */
export function errorMessage(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) return t('errors.network') // fetch itself failed
  if (error.status === 429) return t('errors.throttled')
  const messages = drfMessages(error.body)
  return messages.length > 0 ? messages.join(' ') : t('errors.unexpected', { status: error.status })
}

/** All messages of a DRF error body: {"detail": "..."} or {"field": ["...", ...], ...}. */
function drfMessages(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return []
  return Object.values(body)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map(String)
}

/**
 * Show an API error on a React Hook Form form, the way a Django form shows form.errors:
 * - 400 with DRF field errors ({"email": ["..."]}) → under the matching field
 * - other keys (non_field_errors, detail, fields the form doesn't have) → above the form
 * - 429 and anything else → a translated general message above the form
 */
export function showApiError<T extends FieldValues>(
  setError: UseFormSetError<T>,
  status: number,
  body: unknown,
  fields: readonly Path<T>[],
  t: TFunction,
) {
  if (status === 429) {
    setError(ROOT_ERROR, { message: t('errors.throttled') })
    return
  }
  if (status !== 400 || typeof body !== 'object' || body === null) {
    setError(ROOT_ERROR, { message: t('errors.unexpected', { status }) })
    return
  }

  const general: string[] = []
  for (const [key, value] of Object.entries(body)) {
    const message = Array.isArray(value) ? value.join(' ') : String(value)
    if ((fields as readonly string[]).includes(key)) setError(key as Path<T>, { message })
    else general.push(message)
  }
  if (general.length > 0) setError(ROOT_ERROR, { message: general.join(' ') })
}

/** showApiError for an error thrown by a mutation (ApiError or a network failure). */
export function showMutationError<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: unknown,
  fields: readonly Path<T>[],
  t: TFunction,
) {
  if (error instanceof ApiError) showApiError(setError, error.status, error.body, fields, t)
  else setError(ROOT_ERROR, { message: t('errors.network') })
}
