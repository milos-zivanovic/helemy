import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useSearchParams } from 'react-router'

import { errorMessage } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button, LinkButton } from '../components/Button'
import { SelectField } from '../components/SelectField'
import { StatTile } from '../components/StatTile'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'
import { CategoryOptions } from '../finances/CategoryOptions'
import {
  type Transaction,
  type TransactionFilters,
  useAccounts,
  useBreakdown,
  useCategories,
  useCategoryGroups,
  useInfiniteTransactions,
  useTransactions,
} from '../finances/hooks'
import { RankedBars } from '../finances/RankedBars'
import { useActiveHousehold } from '../household/hooks'
import { useFormatters } from '../i18n/format'
import { currentMonth, fullMonth, isDay, monthRange, shiftMonth, today } from '../lib/dates'
import { useDebouncedValue } from '../lib/useDebouncedValue'

type Params = Record<string, string | null>
type Type = NonNullable<TransactionFilters['transaction_type']>
const TYPES: Type[] = ['expense', 'income', 'transfer']

// /finances/transactions: the main finance screen, like the old wallet's overview. Everything is
// in the URL (?start=2026-11-01&end=2026-11-30&type=expense&group=4&view=chart), like the GET
// parameters of a Django list view with a FilterSet: a reload, a bookmark or the back button keeps
// the filters, and the page is just a function of its URL. No period = all transactions.
// The same filters drive both views: the list, and the chart (totals per group / category).
export function TransactionsPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const get = (key: string) => searchParams.get(key)
  const start = isDay(get('start')) ? get('start') : null
  const end = isDay(get('end')) ? get('end') : null
  // `includes` can't narrow a string to Type, hence the cast after the check.
  const type = TYPES.includes(get('type') as Type) ? (get('type') as Type) : null
  const group = get('group')
  const category = get('category')
  const account = get('account')
  const fixed = get('fixed') === 'true' || get('fixed') === 'false' ? get('fixed') : null
  const view = get('view') === 'chart' ? 'chart' : 'list'

  /** Change some URL parameters (a filter change starts the list over from its first page). */
  const updateParams = (changes: Params) => {
    setSearchParams((params) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      params.delete('page') // old links had ?page=; the list now grows with "load more"
      return params
    })
  }

  // The search box keeps its own state while typing and writes to the URL only after a pause.
  const [search, setSearch] = useState(get('q') ?? '')
  const debouncedSearch = useDebouncedValue(search.trim())
  useEffect(() => {
    if (debouncedSearch !== (searchParams.get('q') ?? '')) updateParams({ q: debouncedSearch })
    // Only the debounced text should trigger this; the other values are read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  // URL parameters → API filters. Spreading `{}` leaves a filter out instead of sending "".
  const filters: TransactionFilters = {
    ...(start ? { start_date: start } : {}),
    ...(end ? { end_date: end } : {}),
    ...(type ? { transaction_type: type } : {}),
    ...(group ? { category_group: Number(group) } : {}),
    ...(category ? { category: Number(category) } : {}),
    ...(account ? { account: Number(account) } : {}),
    ...(fixed ? { is_fixed: fixed === 'true' } : {}),
    ...(get('q') ? { search: get('q')! } : {}),
  }
  // The list: 50 transactions at a time (transfers are pairs of transactions, so they're in it).
  // The totals come with every page. The chart view needs only them, so it asks for a one-row
  // page instead. Only the query of the current view runs (`enabled`).
  const list = useInfiniteTransactions(filters, view === 'list')
  const totalsOnly = useTransactions({ ...filters, page_size: 1 }, view === 'chart')
  const totals = view === 'list' ? list.data?.pages[0] : totalsOnly.data
  const error = view === 'list' ? list.error : totalsOnly.error
  const accounts = useAccounts()
  const backState = { back: location.pathname + location.search }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TotalBalance />
        <LinkButton to="/finances/transactions/new" state={backState}>
          + {t('finances.transactions.new')}
        </LinkButton>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <PeriodPicker start={start} end={end} onChange={updateParams} />
        <Filters
          type={type}
          group={group}
          category={category}
          account={account}
          fixed={fixed}
          search={search}
          onSearch={setSearch}
          onChange={updateParams}
        />
      </div>

      {error && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {totals && <Totals data={totals} showTransfers={account !== null} />}

      <div className="flex self-start rounded-md border border-slate-300 p-1">
        {(['list', 'chart'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => updateParams({ view: option === 'list' ? null : option })}
            className={`rounded px-3 py-1 text-sm font-medium ${
              view === option ? 'bg-slate-900 text-white' : 'text-slate-700'
            }`}
          >
            {t(
              option === 'list'
                ? 'finances.transactions.viewList'
                : 'finances.transactions.viewChart',
            )}
          </button>
        ))}
      </div>

      {view === 'chart' ? (
        <Breakdown filters={filters} type={type} onChange={updateParams} />
      ) : (
        list.data && (
          <>
            {/* isPlaceholderData: still showing the previous result while the new one loads */}
            <div className={list.isPlaceholderData ? 'opacity-60' : ''}>
              {list.data.pages[0].results.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
                  {t('finances.transactions.empty')}
                </p>
              ) : (
                <TransactionList
                  // All pages loaded so far, as one list
                  items={list.data.pages.flatMap((page) => page.results)}
                  backState={backState}
                  showAccount={(accounts.data?.length ?? 0) > 1}
                />
              )}
            </div>
            {list.hasNextPage && (
              <LoadMore
                loading={list.isFetchingNextPage}
                onLoad={() => void list.fetchNextPage()}
                shown={list.data.pages.reduce((sum, page) => sum + page.results.length, 0)}
                total={list.data.pages[0].count}
              />
            )}
          </>
        )
      )}

      {(view === 'list' ? list.isPending : totalsOnly.isPending) && (
        <p className="text-sm text-slate-600">{t('common.loading')}</p>
      )}
    </div>
  )
}

// The real money right now (all accounts, every transaction ever), whatever the filters say.
function TotalBalance() {
  const { t } = useTranslation()
  const { formatMoney } = useFormatters()
  const accounts = useAccounts()
  if (!accounts.data) return <div />
  const total = accounts.data.reduce((sum, item) => sum + Number(item.balance), 0)
  return (
    <div>
      <p className="text-sm text-slate-500">{t('finances.accounts.total')}</p>
      <p className={`text-3xl font-semibold ${total < 0 ? 'text-red-700' : ''}`}>
        {formatMoney(total)}
      </p>
      <TextLink to="/finances/accounts" className="text-sm">
        {t('home.openAccounts')}
      </TextLink>
    </div>
  )
}

// Quick periods, a month stepper (when the period is one calendar month) and a free date range.
function PeriodPicker({
  start,
  end,
  onChange,
}: {
  start: string | null
  end: string | null
  onChange: (changes: Params) => void
}) {
  const { t } = useTranslation()
  const { formatMonth } = useFormatters()
  const month = fullMonth(start, end)
  const year = today().slice(0, 4)
  const setMonth = (value: string) => onChange(monthRange(value))

  const presets = [
    { label: t('finances.filters.allTime'), start: null, end: null },
    { label: t('finances.budgets.thisMonth'), ...monthRange(currentMonth()) },
    { label: t('finances.reports.lastMonth'), ...monthRange(shiftMonth(currentMonth(), -1)) },
    { label: t('finances.budgets.thisYear'), start: `${year}-01-01`, end: `${year}-12-31` },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset) => {
          const selected = preset.start === start && preset.end === end
          return (
            <Button
              key={preset.label}
              variant={selected ? 'primary' : 'secondary'}
              aria-pressed={selected}
              onClick={() => onChange({ start: preset.start, end: preset.end })}
            >
              {preset.label}
            </Button>
          )
        })}
        {month && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              aria-label={t('finances.transactions.previousMonth')}
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ‹
            </Button>
            <span className="min-w-32 text-center text-sm font-medium capitalize">
              {formatMonth(month)}
            </span>
            <Button
              variant="secondary"
              aria-label={t('finances.transactions.nextMonth')}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              ›
            </Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <TextField
          label={t('finances.categories.startDate')}
          type="date"
          value={start ?? ''}
          onChange={(event) => onChange({ start: event.target.value })}
        />
        <TextField
          label={t('finances.categories.endDate')}
          type="date"
          value={end ?? ''}
          onChange={(event) => onChange({ end: event.target.value })}
        />
      </div>
    </div>
  )
}

function Filters({
  type,
  group,
  category,
  account,
  fixed,
  search,
  onSearch,
  onChange,
}: {
  type: Type | null
  group: string | null
  category: string | null
  account: string | null
  fixed: string | null
  search: string
  onSearch: (value: string) => void
  onChange: (changes: Params) => void
}) {
  const { t } = useTranslation()
  const groups = useCategoryGroups()
  const categories = useCategories()
  // With a group chosen, the category select offers only that group's categories.
  const groupName = groups.data?.find((item) => String(item.id) === group)?.name
  const categoryOptions = (categories.data ?? []).filter(
    (item) => !groupName || item.category_group_name === groupName,
  )
  const accounts = useAccounts()

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <SelectField
        label={t('finances.fields.type')}
        value={type ?? ''}
        onChange={(event) => onChange({ type: event.target.value })}
      >
        <option value="">{t('finances.filters.allTypes')}</option>
        {TYPES.map((item) => (
          <option key={item} value={item}>
            {t(`finances.types.${item}`)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('finances.categories.group')}
        value={group ?? ''}
        // A category of another group would hide everything, so a new group resets it.
        onChange={(event) => onChange({ group: event.target.value, category: null })}
      >
        <option value="">{t('finances.reports.allGroups')}</option>
        {(groups.data ?? []).map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('finances.fields.category')}
        value={category ?? ''}
        onChange={(event) => onChange({ category: event.target.value })}
      >
        <option value="">{t('finances.filters.allCategories')}</option>
        <CategoryOptions categories={categoryOptions} />
      </SelectField>
      <SelectField
        label={t('finances.fields.account')}
        value={account ?? ''}
        onChange={(event) => onChange({ account: event.target.value })}
      >
        <option value="">{t('finances.filters.allAccounts')}</option>
        {(accounts.data ?? []).map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label={t('finances.filters.fixed')}
        value={fixed ?? ''}
        onChange={(event) => onChange({ fixed: event.target.value })}
      >
        <option value="">{t('finances.filters.fixedAll')}</option>
        <option value="true">{t('finances.filters.fixedOnly')}</option>
        <option value="false">{t('finances.filters.fixedNone')}</option>
      </SelectField>
      <TextField
        label={t('finances.filters.search')}
        type="search"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
      />
    </div>
  )
}

// Transfers aren't income or expenses. With an account filter the balance is that account's
// change in the period, so the transfers into and out of it (net) count too and get their own
// tile; without one they cancel out (both halves are listed).
function Totals({
  data,
  showTransfers,
}: {
  data: { total_incomes: string; total_expenses: string; total_transfers: string; total: string }
  showTransfers: boolean
}) {
  const { t } = useTranslation()
  const { formatMoney } = useFormatters()
  const transfers = Number(data.total_transfers)
  return (
    <dl className={`grid gap-3 ${showTransfers ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
      <StatTile
        label={t('finances.totals.income')}
        tone="text-green-700"
        value={formatMoney(data.total_incomes)}
      />
      <StatTile
        label={t('finances.totals.expense')}
        tone="text-red-700"
        value={formatMoney(data.total_expenses)}
      />
      {showTransfers && (
        <StatTile
          label={t('finances.totals.transfers')}
          tone="text-slate-500"
          value={`${transfers > 0 ? '+' : ''}${formatMoney(transfers)}`}
        />
      )}
      <StatTile label={t('finances.totals.balance')} value={formatMoney(data.total)} />
    </dl>
  )
}

// The chart view: the filtered transactions summed per category group, or per category once a
// group is chosen. A group's bar drills down into it; a category's bar opens its transactions.
function Breakdown({
  filters,
  type,
  onChange,
}: {
  filters: TransactionFilters
  type: Type | null
  onChange: (changes: Params) => void
}) {
  const { t } = useTranslation()
  // Income and expenses don't add up into one chart: without a type filter, expenses are shown.
  // Transfers are never in it (moving money isn't spending it).
  const breakdown = useBreakdown({ ...filters, transaction_type: type ?? 'expense' })

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {t(type === 'income' ? 'finances.reports.incomeBy' : 'finances.reports.expensesBy')}
        </h2>
        {filters.category_group !== undefined && (
          <Button variant="secondary" onClick={() => onChange({ group: null, category: null })}>
            ‹ {t('finances.reports.allGroups')}
          </Button>
        )}
      </div>
      {breakdown.isError && <Alert tone="error">{errorMessage(breakdown.error, t)}</Alert>}
      {breakdown.data && (
        <div className={breakdown.isPlaceholderData ? 'opacity-60' : ''}>
          {breakdown.data.results.length === 0 ? (
            <p className="text-sm text-slate-600">{t('finances.transactions.empty')}</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-500">
                {breakdown.data.group_by === 'category_group'
                  ? t('finances.reports.byGroupHint')
                  : t('finances.transactions.byCategoryHint')}
              </p>
              <RankedBars
                items={breakdown.data.results}
                total={breakdown.data.total}
                onSelect={(item) =>
                  breakdown.data.group_by === 'category_group'
                    ? onChange({ group: String(item.id), category: null })
                    : onChange({ category: String(item.id), view: null })
                }
              />
            </>
          )}
        </div>
      )}
    </section>
  )
}

// The next 50 rows: by a button, or by itself when the button scrolls into view (an
// IntersectionObserver tells when an element becomes visible, no scroll events needed).
function LoadMore({
  loading,
  onLoad,
  shown,
  total,
}: {
  loading: boolean
  onLoad: () => void
  shown: number
  total: number
}) {
  const { t } = useTranslation()
  const button = useRef<HTMLButtonElement>(null)
  // The latest onLoad/loading for the observer, which is created once (a ref doesn't re-render).
  const latest = useRef({ onLoad, loading })
  useEffect(() => {
    latest.current = { onLoad, loading }
  })
  useEffect(() => {
    const element = button.current
    if (!element) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !latest.current.loading) latest.current.onLoad()
    })
    observer.observe(element)
    return () => observer.disconnect() // cleanup when the button goes away (last page loaded)
  }, [])

  return (
    <div className="flex flex-col items-center gap-1">
      <Button ref={button} variant="secondary" disabled={loading} onClick={onLoad}>
        {loading ? t('common.loading') : t('finances.transactions.loadMore')}
      </Button>
      <span className="text-xs text-slate-500">
        {t('finances.transactions.shownOf', { shown, total })}
      </span>
    </div>
  )
}

// Rows grouped under a heading per day (the API returns them newest first).
function TransactionList({
  items,
  backState,
  showAccount,
}: {
  items: Transaction[]
  backState: { back: string }
  showAccount: boolean // the account name matters only when there's more than one
}) {
  const { formatDay } = useFormatters()
  const household = useActiveHousehold()
  const showUser = (household?.member_count ?? 1) > 1 // who entered it matters only when sharing

  const days: [string, Transaction[]][] = []
  for (const item of items) {
    const day = item.date ?? ''
    if (days.at(-1)?.[0] === day) days.at(-1)![1].push(item)
    else days.push([day, [item]])
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map(([day, dayItems]) => (
        <section key={day}>
          <h3 className="mb-1 px-1 text-xs font-medium text-slate-500 capitalize">
            {formatDay(day)}
          </h3>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {dayItems.map((transaction) => (
              <li key={transaction.id}>
                <TransactionRow
                  transaction={transaction}
                  backState={backState}
                  showAccount={showAccount}
                  showUser={showUser}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// Income in green, an expense in red. Half of a transfer in neutral grey: it moves money between
// two accounts, it isn't income or expense. Its title names the other account, read from the API
// each time (`transfer.account`), so it follows renames and the current language.
function TransactionRow({
  transaction,
  backState,
  showAccount,
  showUser,
}: {
  transaction: Transaction
  backState: { back: string }
  showAccount: boolean
  showUser: boolean
}) {
  const { t } = useTranslation()
  const { formatMoney } = useFormatters()
  const pair = transaction.transfer
  const outgoing = transaction.transaction_type === 'expense'
  const user = showUser ? transaction.user.full_name || transaction.user.email : null

  const [title, details, tone] = pair
    ? [
        `⇄ ${t(outgoing ? 'finances.transfers.toAccount' : 'finances.transfers.fromAccount', {
          name: pair.account.name,
        })}`,
        // A transfer row always names its account: that's the side of the transfer it shows.
        [transaction.account.name, transaction.description, user],
        'text-slate-500',
      ]
    : [
        transaction.title,
        [
          `${transaction.category.category_group_name} / ${transaction.category.name}`,
          showAccount ? transaction.account.name : null,
          user,
        ],
        outgoing ? 'text-red-700' : 'text-green-700',
      ]

  return (
    <Link
      // A transfer opens as a whole; the transfer page accepts either half's id.
      to={
        pair ? `/finances/transfers/${transaction.id}` : `/finances/transactions/${transaction.id}`
      }
      state={backState}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
    >
      <span className="min-w-0">
        <span className={`block truncate text-sm font-medium ${pair ? 'text-slate-700' : ''}`}>
          {title}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {details.filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className={`shrink-0 text-sm font-semibold ${tone}`}>
        {transaction.type_sign}
        {formatMoney(transaction.amount)}
      </span>
    </Link>
  )
}
