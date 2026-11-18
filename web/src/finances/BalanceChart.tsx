import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { components } from '../api/schema'
import { useFormatters } from '../i18n/format'
import { AXIS_COLOR, GRID_COLOR, MUTED_TEXT, SERIES_COLOR } from '../lib/chartTheme'

type BalanceDay = components['schemas']['BalanceDay']

/**
 * Running balance over the period (one series, so no legend: the card title names it). Recharts
 * builds the SVG from data + a few child components, like a declarative template: <XAxis>, <Area>
 * etc. describe what to draw, the library works out the coordinates.
 */
export function BalanceChart({ days }: { days: BalanceDay[] }) {
  const { t } = useTranslation()
  const { formatMoney, formatShortDate, formatCompact, formatDay } = useFormatters()
  // The API sends decimal strings; a chart needs numbers.
  const data = days.map((day) => ({
    date: day.date,
    balance: Number(day.balance),
    net: Number(day.net),
  }))

  return (
    <>
      {/* The container includes the x-axis band, so labels never spill out of the card. */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_COLOR} />
            <XAxis
              dataKey="date"
              tickFormatter={(date: string) => formatShortDate(date)}
              tick={{ fill: MUTED_TEXT, fontSize: 12 }}
              axisLine={{ stroke: AXIS_COLOR }}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis
              tickFormatter={(value: number) => formatCompact(value)}
              tick={{ fill: MUTED_TEXT, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <ReferenceLine y={0} stroke={AXIS_COLOR} />
            <Tooltip
              cursor={{ stroke: AXIS_COLOR }}
              content={({ active, payload }) => {
                const point = active ? payload?.[0]?.payload : undefined
                if (!point) return null
                return (
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
                    <p className="font-medium capitalize">{formatDay(point.date)}</p>
                    <p>
                      {t('finances.reports.balance')}: {formatMoney(point.balance)}
                    </p>
                    <p className="text-slate-500">
                      {t('finances.reports.dayNet')}: {formatMoney(point.net)}
                    </p>
                  </div>
                )
              }}
            />
            <Area
              type="linear"
              dataKey="balance"
              stroke={SERIES_COLOR}
              strokeWidth={2}
              fill={SERIES_COLOR}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, stroke: '#ffffff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <BalanceTable days={data} />
    </>
  )
}

// The same numbers as a table (days with transactions only), so nothing depends on hovering.
function BalanceTable({ days }: { days: { date: string; balance: number; net: number }[] }) {
  const { t } = useTranslation()
  const { formatMoney, formatShortDate } = useFormatters()
  const active = days.filter((day) => day.net !== 0)
  if (active.length === 0) return null

  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-slate-600">{t('finances.reports.showTable')}</summary>
      <div className="mt-2 max-h-72 overflow-y-auto">
        <table className="w-full text-left tabular-nums">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1 font-medium">{t('finances.fields.date')}</th>
              <th className="py-1 text-right font-medium">{t('finances.reports.dayNet')}</th>
              <th className="py-1 text-right font-medium">{t('finances.reports.balance')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {active.map((day) => (
              <tr key={day.date}>
                <td className="py-1">{formatShortDate(day.date)}</td>
                <td className="py-1 text-right">{formatMoney(day.net)}</td>
                <td className="py-1 text-right">{formatMoney(day.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
