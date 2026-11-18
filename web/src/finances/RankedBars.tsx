import { useTranslation } from 'react-i18next'

import type { components } from '../api/schema'
import { useFormatters } from '../i18n/format'
import { SERIES_COLOR } from '../lib/chartTheme'

type Item = components['schemas']['BreakdownItem']

/**
 * Horizontal bars ranked largest first (the API sorts them): one series, one colour, so length is the
 * only thing to compare. Plain HTML instead of a chart library: every row is also readable text
 * (name, amount, share), which doubles as the table view, and a row can be a button to drill down.
 */
export function RankedBars({
  items,
  total,
  onSelect,
}: {
  items: Item[]
  total: string
  onSelect?: (item: Item) => void
}) {
  const { t } = useTranslation()
  const { formatMoney } = useFormatters()
  const max = Math.max(...items.map((item) => Number(item.total)), 0)
  const sum = Number(total)

  if (items.length === 0) {
    return <p className="text-sm text-slate-600">{t('finances.reports.noData')}</p>
  }

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const value = Number(item.total)
        const share = sum > 0 ? Math.round((value / sum) * 100) : 0
        const content = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{item.name}</span>
              <span className="shrink-0 text-slate-600 tabular-nums">
                {formatMoney(value)} · {share} %
              </span>
            </span>
            {/* 12px bar: square at the baseline (left), 4px rounded end */}
            <span className="mt-1 block h-3 w-full">
              <span
                className="block h-full rounded-r"
                style={{
                  width: `${max > 0 ? (value / max) * 100 : 0}%`,
                  backgroundColor: SERIES_COLOR,
                }}
              />
            </span>
          </>
        )
        return (
          <li key={item.id}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-slate-50 focus-visible:bg-slate-50"
              >
                {content}
              </button>
            ) : (
              <div className="px-2 py-1.5">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
