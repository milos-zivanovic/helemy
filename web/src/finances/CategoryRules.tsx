import { useTranslation } from 'react-i18next'

import type { components } from '../api/schema'
import { useFormatters } from '../i18n/format'

type Rules = Pick<
  components['schemas']['CategoryListItem'],
  'start_date' | 'end_date' | 'start_month' | 'start_day' | 'end_month' | 'end_day'
>

/** A category's activity rules in words, e.g. "1. jun – 31. avgust, svake godine". */
export function CategoryRules({ category }: { category: Rules }) {
  const { t } = useTranslation()
  const { formatShortDate, formatMonthDay } = useFormatters()
  const parts: string[] = []

  const { start_date: start, end_date: end } = category
  if (start && end) parts.push(`${formatShortDate(start)} – ${formatShortDate(end)}`)
  else if (start) parts.push(t('finances.categories.rules.from', { date: formatShortDate(start) }))
  else if (end) parts.push(t('finances.categories.rules.until', { date: formatShortDate(end) }))

  const { start_month, start_day, end_month, end_day } = category
  const yearlyStart = start_month && start_day ? formatMonthDay(start_month, start_day) : null
  const yearlyEnd = end_month && end_day ? formatMonthDay(end_month, end_day) : null
  if (yearlyStart || yearlyEnd) {
    const window =
      yearlyStart && yearlyEnd
        ? `${yearlyStart} – ${yearlyEnd}`
        : yearlyStart
          ? t('finances.categories.rules.from', { date: yearlyStart })
          : t('finances.categories.rules.until', { date: yearlyEnd })
    parts.push(t('finances.categories.rules.yearly', { window }))
  }

  if (parts.length === 0) return null
  return <span>{parts.join(' · ')}</span>
}
