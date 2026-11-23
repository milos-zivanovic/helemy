import { useTranslation } from 'react-i18next'

import type { components } from '../api/schema'
import { useMe } from '../auth/useAuth'
import { parseDate } from '../lib/dates'
import type { Language } from '.'

// Intl locale per app language. Plain "sr" would format in Cyrillic; the app is in Latin script.
const LOCALES: Record<Language, string> = { sr: 'sr-Latn-RS', en: 'en-GB' }

export type WeightUnit = components['schemas']['WeightUnitEnum']
/** The API's units, in the order selects offer them. */
export const WEIGHT_UNITS: WeightUnit[] = ['kg', 'lb']

/**
 * Formatting in the current language, like Django's localize / date filter. Intl is built into the
 * browser: it knows month names, date order, thousand separators and currency symbols per locale.
 */
export function useFormatters() {
  const { i18n, t } = useTranslation()
  const { data: me } = useMe()
  const locale = LOCALES[(i18n.resolvedLanguage ?? 'en') as Language] ?? LOCALES.en
  const currency = me?.currency || 'RSD'

  let money: Intl.NumberFormat
  try {
    money = new Intl.NumberFormat(locale, { style: 'currency', currency })
  } catch {
    // An unknown currency code throws RangeError; show the plain number instead.
    money = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return {
    /** A datetime (ISO string) or Date: "18. novembar 2026." */
    formatDate: (value: string | Date) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(value)),
    /** A calendar day "YYYY-MM-DD": "sreda, 18. novembar 2026." */
    formatDay: (value: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(parseDate(value)),
    /** A month "YYYY-MM": "novembar 2026." */
    formatMonth: (value: string) =>
      new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        parseDate(`${value}-01`),
      ),
    /** A calendar day "YYYY-MM-DD", compact: "18. nov 2026." */
    formatShortDate: (value: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parseDate(value)),
    /** Day and month without a year (a yearly window): "1. jun" */
    formatMonthDay: (month: number, day: number) =>
      new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(
        new Date(2024, month - 1, day), // 2024 is a leap year, so 29 February works
      ),
    /** Short weekday names, Monday first: ["pon", "uto", …] / ["Mon", "Tue", …] */
    weekdayNames: () =>
      Array.from({ length: 7 }, (_, index) =>
        // 1 January 2024 was a Monday
        new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 1 + index)),
      ),
    /** Month name for a number 1-12: "januar" */
    monthName: (month: number) =>
      new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, month - 1, 1)),
    /** A short number for chart axes: 12.500 → "12,5 hilj." / "12.5K" */
    formatCompact: (value: number) =>
      new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
        value,
      ),
    /** The unit's short label: "kg", "lbs". */
    unitLabel: (unit: WeightUnit) => t(`units.${unit}`),
    /** A weight ("82.50" from the API) without needless zeros, with its unit: "82,5 kg"; null → "—". */
    formatWeight: (value: string | number | null | undefined, unit: WeightUnit) =>
      value === null || value === undefined || value === ''
        ? '—'
        : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value))} ${t(`units.${unit}`)}`,
    /** A volume (weight × reps) with its unit: "12.450,5 kg" */
    formatVolume: (value: number, unit: WeightUnit) =>
      `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${t(`units.${unit}`)}`,
    /** A plain number (volumes, counts): "12.450" */
    formatNumber: (value: number) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value),
    /** An API amount ("1234.50", a decimal string) in the user's currency: "1.234,50 RSD". */
    formatMoney: (value: string | number) => money.format(Number(value)),
  }
}
