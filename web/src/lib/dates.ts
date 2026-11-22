// Calendar dates as the API sends them: "YYYY-MM-DD" strings without a time or time zone, like
// Django's DateField. Months are "YYYY-MM".
//
// The trap: new Date('2026-11-18') means midnight UTC, and toISOString() converts to UTC. Around
// midnight, or in a time zone west of UTC, both give the wrong day. It is the frontend version of
// timezone.now().date() vs timezone.localdate(). These helpers stay in local time.

const pad = (value: number) => String(value).padStart(2, '0')

/** Date object → "YYYY-MM-DD" in local time. */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** "YYYY-MM-DD" → Date at local midnight. */
export function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Today in local time, like timezone.localdate(). */
export function today(): string {
  return toDateString(new Date())
}

export function currentMonth(): string {
  return today().slice(0, 7)
}

export function isMonth(value: string | null): value is string {
  return value !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** "2026-11" → first and last day: { start: "2026-11-01", end: "2026-11-30" }. */
export function monthRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0).getDate() // day 0 of the next month = last day
  return { start: `${month}-01`, end: `${month}-${pad(lastDay)}` }
}

/** "2026-11", -1 → "2026-10"; "2026-12", 1 → "2027-01". */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + delta, 1)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

/** The day `delta` days after a "YYYY-MM-DD" day (negative = before). */
export function shiftDay(day: string, delta: number): string {
  const date = parseDate(day)
  date.setDate(date.getDate() + delta)
  return toDateString(date)
}

/**
 * "YYYY-MM-DD" check for values from the URL. The round trip rejects days that don't exist:
 * new Date(2026, 1, 30) silently rolls over to 2 March, so "2026-02-30" would otherwise pass.
 */
export function isDay(value: string | null): value is string {
  return (
    value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) && toDateString(parseDate(value)) === value
  )
}

/** "2026-11" when start..end is exactly that calendar month, otherwise null. */
export function fullMonth(start: string | null, end: string | null): string | null {
  if (!start || !end || start.slice(0, 7) !== end.slice(0, 7)) return null
  const range = monthRange(start.slice(0, 7))
  return range.start === start && range.end === end ? start.slice(0, 7) : null
}

/** "2026-11-05" → "05/11/2026", the day/month/year form shown in date fields. */
export function toDisplayDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

/** "05/11/2026" → "2026-11-05"; null when it isn't a complete, existing day ("31/02/2026"). */
export function fromDisplayDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!match) return null
  const value = `${match[3]}-${match[2]}-${match[1]}`
  return isDay(value) ? value : null
}

/**
 * What's typed, shaped as dd/mm/yyyy: only digits count, the slashes are put in by themselves
 * ("0511" → "05/11", "05112026" → "05/11/2026"), at most 8 digits.
 */
export function maskDisplayDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/')
}
