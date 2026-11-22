import type { TFunction } from 'i18next'
import { z } from 'zod'

// Dates in the forms' Zod schemas. A DateField hands over "YYYY-MM-DD" for a whole day, '' for an
// empty field and the text itself for anything half typed ("31/02"), so the shape check is enough
// to tell a missing date from a wrong one.
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A date the form can't do without. */
export const requiredDate = (t: TFunction) =>
  z.string().min(1, t('validation.required')).regex(DAY, t('date.invalid'))

/** An optional date: '' becomes null for the API. */
export const optionalDate = (t: TFunction) =>
  z
    .string()
    .refine((value) => value === '' || DAY.test(value), t('date.invalid'))
    .transform((value) => value || null)
