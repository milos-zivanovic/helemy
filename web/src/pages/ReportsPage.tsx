import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { errorMessage } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { DateField } from '../components/DateField'
import { SelectField } from '../components/SelectField'
import { StatTile } from '../components/StatTile'
import { segmentedOption, segmentedTrack } from '../components/segmented'
import { BalanceChart } from '../finances/BalanceChart'
import {
  type ReportFilters,
  useAccounts,
  useBalanceHistory,
  useBreakdown,
  usePeriodTotals,
} from '../finances/hooks'
import { RankedBars } from '../finances/RankedBars'
import { useFormatters } from '../i18n/format'
import { currentMonth, monthRange, today } from '../lib/dates'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// /finances/reports?start=2026-11-01&end=2026-11-30&type=expense&group=4
// One period (in the URL) scopes everything on the page: the totals, the breakdown and the chart.
export default function ReportsPage() {
  const { t } = useTranslation()
  const { formatMoney } = useFormatters()
  const [searchParams, setSearchParams] = useSearchParams()

  const thisMonth = monthRange(currentMonth())
  const startParam = searchParams.get('start') ?? ''
  const endParam = searchParams.get('end') ?? ''
  const start = DATE.test(startParam) ? startParam : thisMonth.start
  const end = DATE.test(endParam) ? endParam : thisMonth.end
  const type = searchParams.get('type') === 'income' ? 'income' : 'expense'
  const group = Number(searchParams.get('group')) || null
  const account = Number(searchParams.get('account')) || null

  const update = (changes: Record<string, string | null>) =>
    setSearchParams((params) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      return params
    })

  const period: ReportFilters = { start_date: start, end_date: end }
  const totals = usePeriodTotals(start, end)
  const breakdown = useBreakdown({
    ...period,
    transaction_type: type,
    ...(group ? { category_group: group } : {}),
  })
  // The running balance stops at today: days that haven't happened would only draw a flat line.
  const balanceEnd = end > today() ? today() : end
  const accounts = useAccounts()
  const balance = useBalanceHistory({
    ...(start <= today() ? { start_date: start, end_date: balanceEnd } : period),
    ...(account ? { account } : {}),
  })

  return (
    <div className="flex flex-col gap-4">
      {/* The period (from–to) above everything it scopes; this month by default */}
      <div className="surface p-4">
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <DateField
            label={t('finances.categories.startDate')}
            value={start}
            onChange={(value) => update({ start: value })}
          />
          <DateField
            label={t('finances.categories.endDate')}
            value={end}
            onChange={(value) => update({ end: value })}
          />
        </div>
      </div>

      {totals.data && (
        <dl className="grid grid-cols-3 gap-3">
          <StatTile
            label={t('finances.totals.income')}
            tone="text-green-700"
            value={formatMoney(totals.data.total_incomes)}
          />
          <StatTile
            label={t('finances.totals.expense')}
            tone="text-red-700"
            value={formatMoney(totals.data.total_expenses)}
          />
          <StatTile label={t('finances.totals.balance')} value={formatMoney(totals.data.total)} />
        </dl>
      )}

      <Card
        title={t(type === 'income' ? 'finances.reports.incomeBy' : 'finances.reports.expensesBy')}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className={segmentedTrack}>
            {(['expense', 'income'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={type === option}
                onClick={() => update({ type: option === 'expense' ? null : option, group: null })}
                className={segmentedOption(type === option)}
              >
                {t(`finances.types.${option}`)}
              </button>
            ))}
          </div>
          {group !== null && (
            <Button variant="secondary" onClick={() => update({ group: null })}>
              ‹ {t('finances.reports.allGroups')}
            </Button>
          )}
        </div>
        {breakdown.isError && <Alert tone="error">{errorMessage(breakdown.error, t)}</Alert>}
        {breakdown.data && (
          <div className={breakdown.isPlaceholderData ? 'opacity-60' : ''}>
            <p className="mb-2 text-xs text-slate-500">
              {breakdown.data.group_by === 'category_group'
                ? t('finances.reports.byGroupHint')
                : t('finances.reports.byCategoryHint')}
            </p>
            <RankedBars
              items={breakdown.data.results}
              total={breakdown.data.total}
              // Drill down: a group's bar opens its categories; categories are the last level.
              onSelect={
                breakdown.data.group_by === 'category_group'
                  ? (item) => update({ group: String(item.id) })
                  : undefined
              }
            />
          </div>
        )}
      </Card>

      <Card title={t('finances.reports.balanceTitle')}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <p className="text-xs text-slate-500">{t('finances.reports.balanceHint')}</p>
          {(accounts.data?.length ?? 0) > 1 && (
            <SelectField
              label={t('finances.fields.account')}
              value={account ?? ''}
              onChange={(event) => update({ account: event.target.value || null })}
            >
              <option value="">{t('finances.filters.allAccounts')}</option>
              {accounts.data!.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          )}
        </div>
        {balance.isError && <Alert tone="error">{errorMessage(balance.error, t)}</Alert>}
        {start > today() && (
          <p className="text-sm text-slate-600">{t('finances.reports.noData')}</p>
        )}
        {balance.data && start <= today() && (
          <div className={balance.isPlaceholderData ? 'opacity-60' : ''}>
            <BalanceChart days={balance.data.results} />
          </div>
        )}
      </Card>
    </div>
  )
}
