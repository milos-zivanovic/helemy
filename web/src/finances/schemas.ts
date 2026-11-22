import type { TFunction } from 'i18next'
import { z } from 'zod'

import { optionalDate, requiredDate } from '../lib/dateSchemas'

// What the user types and what the API gets are not the same here, and Zod handles both sides:
// the form works with strings (inputs and selects always hold strings), the schema checks them and
// transforms them into the API's shape. React Hook Form's handleSubmit receives the transformed values.

// "1234,5", "1 234.5" or "1234.50" → "1234.50", the API's decimal string (max_digits=8,
// decimal_places=2). Thousand separators other than spaces are not accepted.
const amountField = (t: TFunction) =>
  z
    .string()
    .trim()
    .transform((value) => value.replaceAll(' ', '').replace(',', '.'))
    .pipe(
      z
        .string()
        .regex(/^\d{1,6}(\.\d{1,2})?$/, t('validation.amount'))
        .refine((value) => Number(value) > 0, t('validation.amount')),
    )
    .transform((value) => Number(value).toFixed(2))

export const transactionSchema = (t: TFunction) =>
  z.object({
    transaction_type: z.enum(['expense', 'income']),
    title: z
      .string()
      .trim()
      .min(1, t('validation.required'))
      .max(100, t('validation.maxLength', { max: 100 })),
    amount: amountField(t),
    date: requiredDate(t),
    // A <select> gives a string; the API wants the id as a number.
    category_id: z.string().min(1, t('validation.required')).transform(Number),
    account_id: z.string().min(1, t('validation.required')).transform(Number),
    description: z
      .string()
      .trim()
      .max(255, t('validation.maxLength', { max: 255 })),
    is_fixed: z.boolean(),
  })

/** The form's own values (before the schema's transforms): what defaultValues and setValue use. */
export type TransactionFormValues = z.input<ReturnType<typeof transactionSchema>>

// Days per month in a leap year (29 February is allowed in a yearly window).
const daysInMonth = (month: number) => new Date(2024, month, 0).getDate()

const optionalNumber = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value)))

export const categorySchema = (t: TFunction) =>
  z
    .object({
      name: z
        .string()
        .trim()
        .min(1, t('validation.required'))
        .max(100, t('validation.maxLength', { max: 100 })),
      category_group_id: z.string().min(1, t('validation.required')).transform(Number),
      is_active: z.boolean(),
      start_date: optionalDate(t),
      end_date: optionalDate(t),
      start_month: optionalNumber,
      start_day: optionalNumber,
      end_month: optionalNumber,
      end_day: optionalNumber,
    })
    // superRefine: checks across fields after each field's own transform, like Form.clean(). Each
    // problem is added under the field it belongs to.
    .superRefine((values, ctx) => {
      if (values.start_date && values.end_date && values.end_date < values.start_date) {
        ctx.addIssue({
          code: 'custom',
          path: ['end_date'],
          message: t('validation.endBeforeStart'),
        })
      }
      for (const bound of ['start', 'end'] as const) {
        const month = values[`${bound}_month`]
        const day = values[`${bound}_day`]
        if ((month === null) !== (day === null)) {
          ctx.addIssue({
            code: 'custom',
            path: [`${bound}_day`],
            message: t('finances.categories.monthAndDay'),
          })
        } else if (
          month !== null &&
          day !== null &&
          (!Number.isInteger(day) || day < 1 || day > daysInMonth(month))
        ) {
          ctx.addIssue({
            code: 'custom',
            path: [`${bound}_day`],
            message: t('finances.categories.invalidDay'),
          })
        }
      }
    })

export type CategoryFormValues = z.input<ReturnType<typeof categorySchema>>

export const budgetSchema = (t: TFunction) =>
  z
    .object({
      category_id: z.string().min(1, t('validation.required')).transform(Number),
      amount: amountField(t),
      start_date: requiredDate(t),
      end_date: requiredDate(t),
      description: z
        .string()
        .trim()
        .max(255, t('validation.maxLength', { max: 255 })),
    })
    .refine((values) => values.end_date >= values.start_date, {
      message: t('validation.endBeforeStart'),
      path: ['end_date'],
    })

export type BudgetFormValues = z.input<ReturnType<typeof budgetSchema>>

// Like amountField, but for the bigger account fields (max_digits=12): up to 10 integer digits.
// `signed` allows zero and a minus sign: an opening balance can be 0 or negative (an overdraft).
const bigAmountField = (t: TFunction, signed: boolean) =>
  z
    .string()
    .trim()
    .transform((value) => value.replaceAll(' ', '').replace(',', '.'))
    .pipe(
      z
        .string()
        .regex(
          signed ? /^-?\d{1,10}(\.\d{1,2})?$/ : /^\d{1,10}(\.\d{1,2})?$/,
          t('validation.amount'),
        )
        .refine((value) => signed || Number(value) > 0, t('validation.amount')),
    )
    .transform((value) => Number(value).toFixed(2))

export const accountSchema = (t: TFunction) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t('validation.required'))
      .max(100, t('validation.maxLength', { max: 100 })),
    opening_balance: bigAmountField(t, true),
    opening_date: requiredDate(t),
    is_active: z.boolean(),
  })

export type AccountFormValues = z.input<ReturnType<typeof accountSchema>>

export const transferSchema = (t: TFunction) =>
  z
    .object({
      from_account_id: z.string().min(1, t('validation.required')).transform(Number),
      to_account_id: z.string().min(1, t('validation.required')).transform(Number),
      amount: bigAmountField(t, false),
      date: requiredDate(t),
      description: z
        .string()
        .trim()
        .max(255, t('validation.maxLength', { max: 255 })),
    })
    .refine((values) => values.from_account_id !== values.to_account_id, {
      message: t('finances.transfers.sameAccount'),
      path: ['to_account_id'],
    })

export type TransferFormValues = z.input<ReturnType<typeof transferSchema>>
