import type { TFunction } from 'i18next'
import type { UseFormSetError } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  ROOT_ERROR,
  errorMessage,
  showApiError,
  showMutationError,
  unwrap,
} from './errors'

// Fake t(): returns the key, plus its options when there are any, so the tests see both.
const t = ((key: string, options?: object) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction

type Values = { email: string; password: string }
const FIELDS = ['email', 'password'] as const

/** A spy standing in for React Hook Form's setError; returns its calls as { field: message }. */
function fakeSetError() {
  const setError = vi.fn()
  const shown = () =>
    Object.fromEntries(setError.mock.calls.map(([field, error]) => [field, error.message]))
  return { setError: setError as unknown as UseFormSetError<Values>, shown }
}

describe('unwrap', () => {
  it('returns the data of a 2xx response', () => {
    const result = { data: { id: 1 }, response: new Response(null, { status: 200 }) }
    expect(unwrap(result)).toEqual({ id: 1 })
  })

  it('returns undefined for 204 No Content', () => {
    expect(unwrap({ response: new Response(null, { status: 204 }) })).toBeUndefined()
  })

  it('throws ApiError with the status and body otherwise', () => {
    const body = { detail: 'Not found.' }
    try {
      unwrap({ error: body, response: new Response(null, { status: 404 }) })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toMatchObject({ status: 404, body })
    }
  })
})

describe('errorMessage', () => {
  it('reports a network failure for anything that is not an ApiError', () => {
    expect(errorMessage(new TypeError('Failed to fetch'), t)).toBe('errors.network')
  })

  it('reports throttling for 429', () => {
    expect(errorMessage(new ApiError(429, { detail: 'Slow down.' }), t)).toBe('errors.throttled')
  })

  it('shows DRF detail', () => {
    expect(errorMessage(new ApiError(403, { detail: 'Not allowed.' }), t)).toBe('Not allowed.')
  })

  it('joins all DRF field messages', () => {
    const error = new ApiError(400, { amount: ['Too big.'], non_field_errors: ['Closed account.'] })
    expect(errorMessage(error, t)).toBe('Too big. Closed account.')
  })

  it.each([null, 'Internal Server Error', {}])('falls back to the status for body %j', (body) => {
    expect(errorMessage(new ApiError(500, body), t)).toBe('errors.unexpected {"status":500}')
  })
})

describe('showApiError', () => {
  it('puts field errors under their fields, like form.errors', () => {
    const { setError, shown } = fakeSetError()
    showApiError(setError, 400, { email: ['Enter a valid email.', 'Too long.'] }, FIELDS, t)
    expect(shown()).toEqual({ email: 'Enter a valid email. Too long.' })
  })

  it('puts non-field errors and unknown fields above the form', () => {
    const { setError, shown } = fakeSetError()
    showApiError(
      setError,
      400,
      { password: ['Too short.'], non_field_errors: ['Wrong credentials.'], token: 'Expired.' },
      FIELDS,
      t,
    )
    expect(shown()).toEqual({
      password: 'Too short.',
      [ROOT_ERROR]: 'Wrong credentials. Expired.',
    })
  })

  it('shows throttling above the form for 429', () => {
    const { setError, shown } = fakeSetError()
    showApiError(setError, 429, { detail: 'Request was throttled.' }, FIELDS, t)
    expect(shown()).toEqual({ [ROOT_ERROR]: 'errors.throttled' })
  })

  it.each([
    [500, { detail: 'Server error' }],
    [400, null],
    [400, 'Bad Request'],
  ])('shows a general message for status %d with body %j', (status, body) => {
    const { setError, shown } = fakeSetError()
    showApiError(setError, status, body, FIELDS, t)
    expect(shown()).toEqual({ [ROOT_ERROR]: `errors.unexpected {"status":${status}}` })
  })
})

describe('showMutationError', () => {
  it('handles an ApiError like showApiError', () => {
    const { setError, shown } = fakeSetError()
    showMutationError(setError, new ApiError(400, { email: ['Taken.'] }), FIELDS, t)
    expect(shown()).toEqual({ email: 'Taken.' })
  })

  it('reports a network failure above the form', () => {
    const { setError, shown } = fakeSetError()
    showMutationError(setError, new TypeError('Failed to fetch'), FIELDS, t)
    expect(shown()).toEqual({ [ROOT_ERROR]: 'errors.network' })
  })
})
