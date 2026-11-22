import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  currentMonth,
  fromDisplayDate,
  fullMonth,
  isDay,
  isMonth,
  maskDisplayDate,
  monthRange,
  parseDate,
  shiftDay,
  shiftMonth,
  toDateString,
  toDisplayDate,
  today,
} from './dates'

describe('toDateString / parseDate', () => {
  it('formats a local date with zero padding', () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('parses to local midnight, not UTC midnight', () => {
    const date = parseDate('2026-11-18')
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 10, 18, 0,
    ])
  })

  it('round-trips', () => {
    expect(toDateString(parseDate('2024-02-29'))).toBe('2024-02-29')
  })
})

describe('today / currentMonth', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the local day late in the evening (where toISOString would already be tomorrow)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 11, 31, 23, 30)) // 31 Dec, 23:30 local time
    expect(today()).toBe('2026-12-31')
    expect(currentMonth()).toBe('2026-12')
  })
})

describe('monthRange', () => {
  it.each([
    ['2026-11', '2026-11-01', '2026-11-30'],
    ['2026-12', '2026-12-01', '2026-12-31'],
    ['2026-02', '2026-02-01', '2026-02-28'],
    ['2024-02', '2024-02-01', '2024-02-29'], // leap year
  ])('%s → %s..%s', (month, start, end) => {
    expect(monthRange(month)).toEqual({ start, end })
  })
})

describe('shiftMonth', () => {
  it.each([
    ['2026-11', -1, '2026-10'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-05', 12, '2027-05'],
    ['2026-05', -17, '2024-12'],
    ['2026-05', 0, '2026-05'],
  ])('%s %+d → %s', (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected)
  })
})

describe('shiftDay', () => {
  it.each([
    ['2026-11-18', 1, '2026-11-19'],
    ['2026-11-30', 1, '2026-12-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2026-03-29', 1, '2026-03-30'], // across the daylight saving switch (29 March 2026 in Europe)
  ])('%s %+d → %s', (day, delta, expected) => {
    expect(shiftDay(day, delta)).toBe(expected)
  })
})

describe('isMonth', () => {
  it.each(['2026-01', '2026-12'])('accepts %s', (value) => {
    expect(isMonth(value)).toBe(true)
  })

  it.each([null, '', '2026-00', '2026-13', '2026-1', '2026-11-01', 'abcd-ef'])(
    'rejects %s',
    (value) => {
      expect(isMonth(value)).toBe(false)
    },
  )
})

describe('isDay', () => {
  it.each(['2026-11-18', '2024-02-29', '2026-12-31'])('accepts %s', (value) => {
    expect(isDay(value)).toBe(true)
  })

  it.each([
    null,
    '',
    '2026-11-1',
    '18.11.2026',
    '2026-02-29', // not a leap year
    '2026-02-30',
    '2026-04-31',
    '2026-13-01',
    '2026-00-10',
    '2026-11-00',
  ])('rejects %s', (value) => {
    expect(isDay(value)).toBe(false)
  })
})

describe('fullMonth', () => {
  it('returns the month when the range is exactly one calendar month', () => {
    expect(fullMonth('2026-11-01', '2026-11-30')).toBe('2026-11')
    expect(fullMonth('2024-02-01', '2024-02-29')).toBe('2024-02')
  })

  it.each([
    [null, '2026-11-30'],
    ['2026-11-01', null],
    ['2026-11-02', '2026-11-30'], // doesn't start on the 1st
    ['2026-11-01', '2026-11-29'], // doesn't end on the last day
    ['2026-11-01', '2026-12-31'], // two months
    ['2026-02-01', '2026-02-29'], // 29 Feb doesn't exist in 2026
  ])('returns null for %s..%s', (start, end) => {
    expect(fullMonth(start, end)).toBeNull()
  })
})

describe('toDisplayDate / fromDisplayDate', () => {
  it('turns the API day into day/month/year and back', () => {
    expect(toDisplayDate('2026-11-05')).toBe('05/11/2026')
    expect(fromDisplayDate('05/11/2026')).toBe('2026-11-05')
  })

  it('rejects incomplete text and days that do not exist', () => {
    expect(fromDisplayDate('05/11/20')).toBeNull()
    expect(fromDisplayDate('5/11/2026')).toBeNull()
    expect(fromDisplayDate('31/02/2026')).toBeNull()
    expect(fromDisplayDate('')).toBeNull()
  })
})

describe('maskDisplayDate', () => {
  it('puts the slashes in while typing', () => {
    expect(maskDisplayDate('0')).toBe('0')
    expect(maskDisplayDate('051')).toBe('05/1')
    expect(maskDisplayDate('05112026')).toBe('05/11/2026')
  })

  it('ignores anything but digits and stops at 8 of them', () => {
    expect(maskDisplayDate('05.11.2026')).toBe('05/11/2026')
    expect(maskDisplayDate('05/11/20269')).toBe('05/11/2026')
    expect(maskDisplayDate('')).toBe('')
  })
})
