import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import {
  accountSchema,
  budgetSchema,
  categorySchema,
  transactionSchema,
  transferSchema,
} from './schemas'

// The schemas only pass t() results through as messages, so a fake t that returns the key lets the
// tests check WHICH message an error has without loading i18next.
const t = ((key: string) => key) as unknown as TFunction

/**
 * Error messages by field path ("amount", "end_date"), like Django's form.errors. Duplicates are
 * dropped: Zod also runs .refine() after a failed .regex(), so "abc" gets validation.amount twice
 * (the form shows only the first error per field anyway).
 */
function errors(result: z.ZodSafeParseResult<unknown>): Record<string, string[]> {
  if (result.success) return {}
  const byField: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const messages = (byField[issue.path.join('.')] ??= [])
    if (!messages.includes(issue.message)) messages.push(issue.message)
  }
  return byField
}

describe('transactionSchema', () => {
  const valid = {
    transaction_type: 'expense',
    title: '  Groceries  ',
    amount: '1234,5',
    date: '2026-11-18',
    category_id: '3',
    account_id: '1',
    description: '',
    is_fixed: false,
  }

  it('transforms form strings into the API payload', () => {
    expect(transactionSchema(t).parse(valid)).toEqual({
      transaction_type: 'expense',
      title: 'Groceries',
      amount: '1234.50',
      date: '2026-11-18',
      category_id: 3,
      account_id: 1,
      description: '',
      is_fixed: false,
    })
  })

  it.each([
    ['1234,5', '1234.50'],
    ['1234.5', '1234.50'],
    ['1 234,56', '1234.56'],
    [' 12 ', '12.00'],
    ['0,01', '0.01'],
    ['999999.99', '999999.99'], // max_digits=8, decimal_places=2
  ])('amount %j → %j', (amount, expected) => {
    expect(transactionSchema(t).parse({ ...valid, amount }).amount).toBe(expected)
  })

  it.each(['', '0', '0,00', '-5', 'abc', '1.234,5', '1,2,3', '12.345', '1000000'])(
    'rejects amount %j',
    (amount) => {
      expect(errors(transactionSchema(t).safeParse({ ...valid, amount }))).toEqual({
        amount: ['validation.amount'],
      })
    },
  )

  it('requires a title, a category and an account', () => {
    const result = transactionSchema(t).safeParse({
      ...valid,
      title: '   ',
      category_id: '',
      account_id: '',
    })
    expect(errors(result)).toEqual({
      title: ['validation.required'],
      category_id: ['validation.required'],
      account_id: ['validation.required'],
    })
  })

  it('limits title and description length', () => {
    const result = transactionSchema(t).safeParse({
      ...valid,
      title: 'x'.repeat(101),
      description: 'x'.repeat(256),
    })
    expect(Object.keys(errors(result)).sort()).toEqual(['description', 'title'])
  })
})

describe('categorySchema', () => {
  const valid = {
    name: 'Birthdays',
    category_group_id: '2',
    is_active: true,
    start_date: '',
    end_date: '',
    start_month: '',
    start_day: '',
    end_month: '',
    end_day: '',
  }

  it('turns empty optional fields into null (active all year)', () => {
    expect(categorySchema(t).parse(valid)).toEqual({
      name: 'Birthdays',
      category_group_id: 2,
      is_active: true,
      start_date: null,
      end_date: null,
      start_month: null,
      start_day: null,
      end_month: null,
      end_day: null,
    })
  })

  it('accepts a yearly window, including 29 February', () => {
    const result = categorySchema(t).parse({
      ...valid,
      start_month: '2',
      start_day: '29',
      end_month: '12',
      end_day: '31',
    })
    expect(result).toMatchObject({ start_month: 2, start_day: 29, end_month: 12, end_day: 31 })
  })

  it('rejects an end date before the start date', () => {
    const result = categorySchema(t).safeParse({
      ...valid,
      start_date: '2026-11-18',
      end_date: '2026-11-17',
    })
    expect(errors(result)).toEqual({ end_date: ['validation.endBeforeStart'] })
  })

  it('accepts a range of one day', () => {
    const data = { ...valid, start_date: '2026-11-18', end_date: '2026-11-18' }
    expect(categorySchema(t).safeParse(data).success).toBe(true)
  })

  it.each([
    [{ start_month: '3', start_day: '' }, 'start_day'],
    [{ start_month: '', start_day: '3' }, 'start_day'],
    [{ end_month: '3', end_day: '' }, 'end_day'],
  ])('needs both month and day: %j', (window, field) => {
    expect(errors(categorySchema(t).safeParse({ ...valid, ...window }))).toEqual({
      [field]: ['finances.categories.monthAndDay'],
    })
  })

  it.each([
    ['4', '31'],
    ['2', '30'],
    ['1', '0'],
    ['1', '32'],
    ['1', '1.5'],
  ])("rejects a day that month %s doesn't have: %s", (month, day) => {
    expect(
      errors(categorySchema(t).safeParse({ ...valid, end_month: month, end_day: day })),
    ).toEqual({ end_day: ['finances.categories.invalidDay'] })
  })
})

describe('budgetSchema', () => {
  const valid = {
    category_id: '1',
    amount: '20000',
    start_date: '2026-11-01',
    end_date: '2026-11-30',
    description: '',
  }

  it('accepts a valid budget', () => {
    expect(budgetSchema(t).parse(valid)).toMatchObject({ category_id: 1, amount: '20000.00' })
  })

  it('rejects an end date before the start date', () => {
    const result = budgetSchema(t).safeParse({ ...valid, end_date: '2026-10-31' })
    expect(errors(result)).toEqual({ end_date: ['validation.endBeforeStart'] })
  })
})

describe('accountSchema', () => {
  const valid = {
    name: 'Savings',
    opening_balance: '0',
    opening_date: '2026-01-01',
    is_active: true,
  }

  it.each([
    ['0', '0.00'],
    ['-1500,5', '-1500.50'], // an overdraft
    ['1 000 000', '1000000.00'],
    ['9999999999.99', '9999999999.99'], // max_digits=12
  ])('opening balance %j → %j', (opening_balance, expected) => {
    expect(accountSchema(t).parse({ ...valid, opening_balance }).opening_balance).toBe(expected)
  })

  it.each(['', '--1', '10000000000', '1.234'])('rejects opening balance %j', (opening_balance) => {
    expect(errors(accountSchema(t).safeParse({ ...valid, opening_balance }))).toEqual({
      opening_balance: ['validation.amount'],
    })
  })
})

describe('transferSchema', () => {
  const valid = {
    from_account_id: '1',
    to_account_id: '2',
    amount: '5000',
    date: '2026-11-18',
    description: '',
  }

  it('accepts a transfer between two accounts', () => {
    expect(transferSchema(t).parse(valid)).toEqual({
      from_account_id: 1,
      to_account_id: 2,
      amount: '5000.00',
      date: '2026-11-18',
      description: '',
    })
  })

  it('rejects a transfer to the same account', () => {
    const result = transferSchema(t).safeParse({ ...valid, to_account_id: '1' })
    expect(errors(result)).toEqual({ to_account_id: ['finances.transfers.sameAccount'] })
  })

  it.each(['0', '-100'])('rejects amount %j (unlike an opening balance)', (amount) => {
    expect(errors(transferSchema(t).safeParse({ ...valid, amount }))).toEqual({
      amount: ['validation.amount'],
    })
  })
})
