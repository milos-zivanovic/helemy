import { useTranslation } from 'react-i18next'

import { useMe } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Card } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { StatTile } from '../components/StatTile'
import { TextLink } from '../components/TextLink'
import { useAccounts, useActiveBudgets, usePeriodTotals } from '../finances/hooks'
import { useActiveHousehold, useInvitations } from '../household/hooks'
import { useFormatters } from '../i18n/format'
import { currentMonth, monthRange } from '../lib/dates'

// Start page: a greeting and what needs the user's attention.
export function HomePage() {
  const { t } = useTranslation()
  // Same query key as in AppLayout, so this reads the cached profile: no second request.
  const { data: me } = useMe()
  const household = useActiveHousehold()
  const invitations = useInvitations()
  if (!me) return null // AppLayout renders pages only after the profile has loaded

  const pending = invitations.data?.received.length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {t('home.greeting', { name: me.first_name || me.email })}
      </h1>
      {pending > 0 && (
        <Alert tone="info">
          {t('home.pendingInvitations', { n: pending })}{' '}
          <TextLink to="/household">{t('home.viewInvitations')}</TextLink>
        </Alert>
      )}
      <Balance />
      <MonthSummary />
      <BudgetsAttention />
      {household && (
        <Card title={t('nav.household')}>
          <p className="text-sm">
            {household.name} ·{' '}
            {household.user_role ? t(`household.roles.${household.user_role}`) : '—'} ·{' '}
            {t('home.members', { n: household.member_count })}
          </p>
          <TextLink to="/household" className="mt-2 inline-block text-sm">
            {t('home.openHousehold')}
          </TextLink>
        </Card>
      )}
    </div>
  )
}

// How much money there is now: the total of all accounts, then each active one.
function Balance() {
  const { t } = useTranslation()
  const { formatMoney } = useFormatters()
  const accounts = useAccounts()
  if (!accounts.data || accounts.data.length === 0) return null
  const total = accounts.data.reduce((sum, account) => sum + Number(account.balance), 0)
  const active = accounts.data.filter((account) => account.is_active)

  return (
    <Card title={t('finances.accounts.total')}>
      <p className={`text-3xl font-semibold ${total < 0 ? 'text-red-700' : ''}`}>
        {formatMoney(total)}
      </p>
      {active.length > 1 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {active.map((account) => (
            <li key={account.id} className="flex justify-between gap-3">
              <span className="truncate text-slate-600">{account.name}</span>
              <span className="tabular-nums">{formatMoney(account.balance)}</span>
            </li>
          ))}
        </ul>
      )}
      <TextLink to="/finances/accounts" className="mt-3 inline-block text-sm">
        {t('home.openAccounts')}
      </TextLink>
    </Card>
  )
}

function MonthSummary() {
  const { t } = useTranslation()
  const { formatMoney, formatMonth } = useFormatters()
  const month = currentMonth()
  const { start, end } = monthRange(month)
  const totals = usePeriodTotals(start, end)
  if (!totals.data) return null

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold capitalize">{formatMonth(month)}</h2>
        <TextLink to="/finances/reports" className="text-sm">
          {t('home.openReports')}
        </TextLink>
      </div>
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
    </section>
  )
}

// Only the budgets that need attention (80 % or more spent); nothing when all is well.
function BudgetsAttention() {
  const { t } = useTranslation()
  const { formatMoney } = useFormatters()
  const budgets = useActiveBudgets()
  const attention = (budgets.data?.results ?? []).filter(
    (budget) => Number(budget.percentage) >= 80,
  )
  if (attention.length === 0) return null

  return (
    <Card title={t('home.budgetsAttention')}>
      <ul className="flex flex-col gap-3">
        {attention.map((budget) => (
          <li key={budget.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{budget.category.name}</span>
              <span className="text-slate-600">
                {t('finances.budgets.spentOf', {
                  spent: formatMoney(budget.spent),
                  amount: formatMoney(budget.amount),
                })}{' '}
                · {Math.round(Number(budget.percentage))} %
              </span>
            </div>
            <ProgressBar percentage={Number(budget.percentage)} label={budget.category.name} />
          </li>
        ))}
      </ul>
      <TextLink to="/finances/budgets" className="mt-3 inline-block text-sm">
        {t('home.openBudgets')}
      </TextLink>
    </Card>
  )
}
