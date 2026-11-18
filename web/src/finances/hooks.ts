import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { components, operations } from '../api/schema'

// Every finance query key starts with 'finances'. A write can change many of them at once (a new
// expense changes the list, its totals, the category's counts, budgets, reports), so mutations
// simply invalidate the whole 'finances' prefix: cheap, and never stale.
const FINANCES = 'finances'

export type TransactionFilters = NonNullable<
  operations['finances_transactions_list']['parameters']['query']
>
export type TransactionInput = components['schemas']['TransactionRequest']

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: [FINANCES, 'transactions', filters],
    queryFn: async () =>
      unwrap(await api.GET('/api/finances/transactions/', { params: { query: filters } })),
    // While the next month/page loads, keep showing the current one instead of a loading state.
    placeholderData: keepPreviousData,
  })
}

export function useTransaction(id: number) {
  return useQuery({
    queryKey: [FINANCES, 'transaction', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/finances/transactions/{id}/', { params: { path: { id } } })),
  })
}

/**
 * Categories for a select (id, name, group name). `activeOn` limits them to the ones a transaction
 * on that day may use. One page of 100 (the API maximum) covers any realistic household.
 */
export function useCategories(activeOn?: string) {
  const query = activeOn ? { active_on: activeOn, page_size: 100 } : { page_size: 100 }
  return useQuery({
    queryKey: [FINANCES, 'categories', query],
    queryFn: async () =>
      unwrap(await api.GET('/api/finances/categories/', { params: { query } })).results,
    staleTime: 5 * 60_000, // categories rarely change; mutations invalidate them anyway
  })
}

/** Earlier transactions whose title contains `q`, to prefill the form. Needs 2+ characters. */
export function useTransactionSuggestions(q: string) {
  return useQuery({
    queryKey: [FINANCES, 'suggestions', q],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/finances/transactions/suggestions/', { params: { query: { q } } }),
      ),
    enabled: q.length >= 2,
  })
}

function useInvalidateFinances() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: [FINANCES] })
}

export function useCreateTransaction() {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (body: TransactionInput) =>
      unwrap(await api.POST('/api/finances/transactions/', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateTransaction(id: number) {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (body: TransactionInput) =>
      unwrap(
        await api.PATCH('/api/finances/transactions/{id}/', { params: { path: { id } }, body }),
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteTransaction(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/api/finances/transactions/{id}/', { params: { path: { id } } })),
    // Only mark as stale, don't refetch now: the open edit page would ask for the deleted
    // transaction (404). The list refetches its stale data when the user lands on it.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [FINANCES], refetchType: 'none' }),
  })
}

// --- categories and groups ------------------------------------------------------------------

export type CategoryInput = components['schemas']['CategoryRequest']

export function useCategoryGroups() {
  return useQuery({
    queryKey: [FINANCES, 'category-groups'],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/finances/category-groups/', { params: { query: { page_size: 100 } } }),
      ).results,
  })
}

export function useCategory(id: number) {
  return useQuery({
    queryKey: [FINANCES, 'category', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/finances/categories/{id}/', { params: { path: { id } } })),
  })
}

export function useCreateCategoryGroup() {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (name: string) =>
      unwrap(await api.POST('/api/finances/category-groups/', { body: { name } })),
    onSuccess: invalidate,
  })
}

export function useUpdateCategoryGroup() {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; name?: string; is_active?: boolean }) =>
      unwrap(
        await api.PATCH('/api/finances/category-groups/{id}/', { params: { path: { id } }, body }),
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteCategoryGroup() {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(await api.DELETE('/api/finances/category-groups/{id}/', { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}

export function useCreateCategory() {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (body: CategoryInput) =>
      unwrap(await api.POST('/api/finances/categories/', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateCategory(id: number) {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (body: CategoryInput) =>
      unwrap(await api.PATCH('/api/finances/categories/{id}/', { params: { path: { id } }, body })),
    onSuccess: invalidate,
  })
}

export function useDeleteCategory(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/api/finances/categories/{id}/', { params: { path: { id } } })),
    // Like a deleted transaction: mark stale only, the open edit page must not refetch it (404).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [FINANCES], refetchType: 'none' }),
  })
}

// --- budgets ------------------------------------------------------------------------------

export type BudgetInput = components['schemas']['BudgetRequest']

/** Budgets active today, with overall totals (amount, spent, percentage). */
export function useActiveBudgets() {
  return useQuery({
    queryKey: [FINANCES, 'budgets', 'active'],
    queryFn: async () => unwrap(await api.GET('/api/finances/budgets/')),
  })
}

/** Every budget overlapping `year`, one page at a time. */
export function useBudgetsOfYear(year: number, page: number) {
  return useQuery({
    queryKey: [FINANCES, 'budgets', 'year', year, page],
    queryFn: async () =>
      unwrap(await api.GET('/api/finances/budgets/all/', { params: { query: { year, page } } })),
    placeholderData: keepPreviousData,
  })
}

export function useBudget(id: number) {
  return useQuery({
    queryKey: [FINANCES, 'budget', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/finances/budgets/{id}/', { params: { path: { id } } })),
  })
}

export function useCreateBudget() {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (body: BudgetInput) =>
      unwrap(await api.POST('/api/finances/budgets/', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateBudget(id: number) {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (body: BudgetInput) =>
      unwrap(await api.PATCH('/api/finances/budgets/{id}/', { params: { path: { id } }, body })),
    onSuccess: invalidate,
  })
}

export function useDeleteBudget(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/api/finances/budgets/{id}/', { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [FINANCES], refetchType: 'none' }),
  })
}

// --- reports --------------------------------------------------------------------------------

export type ReportFilters = NonNullable<
  operations['finances_transactions_breakdown_retrieve']['parameters']['query']
>

/** Totals per category group, or per category of one group when `category_group` is set. */
export function useBreakdown(filters: ReportFilters) {
  return useQuery({
    queryKey: [FINANCES, 'breakdown', filters],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/finances/transactions/breakdown/', { params: { query: filters } }),
      ),
    placeholderData: keepPreviousData,
  })
}

/** Running balance per day of the period, starting from 0. */
export function useBalanceHistory(filters: ReportFilters) {
  return useQuery({
    queryKey: [FINANCES, 'balance-history', filters],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/finances/transactions/balance-history/', {
          params: { query: filters },
        }),
      ),
    placeholderData: keepPreviousData,
  })
}

/** Income, expense and balance of a period: the list's totals, fetched with a one-row page. */
export function usePeriodTotals(start: string, end: string) {
  return useTransactions({ start_date: start, end_date: end, page_size: 1 })
}

// --- accounts and transfers -----------------------------------------------------------------

export type Account = components['schemas']['Account']
export type AccountInput = components['schemas']['AccountRequest']
export type TransferInput = components['schemas']['TransferRequest']
export type TransferFilters = NonNullable<
  operations['finances_transfers_list']['parameters']['query']
>

/** All accounts with today's balance: active ones first, then archived (the API's order). */
export function useAccounts() {
  return useQuery({
    queryKey: [FINANCES, 'accounts'],
    queryFn: async () => unwrap(await api.GET('/api/finances/accounts/')),
  })
}

export function useAccount(id: number) {
  return useQuery({
    queryKey: [FINANCES, 'account', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/finances/accounts/{id}/', { params: { path: { id } } })),
  })
}

export function useCreateAccount() {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (body: AccountInput) =>
      unwrap(await api.POST('/api/finances/accounts/', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateAccount(id: number) {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (body: Partial<AccountInput>) =>
      unwrap(await api.PATCH('/api/finances/accounts/{id}/', { params: { path: { id } }, body })),
    onSuccess: invalidate,
  })
}

export function useDeleteAccount(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/api/finances/accounts/{id}/', { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [FINANCES], refetchType: 'none' }),
  })
}

export function useTransfers(filters: TransferFilters) {
  return useQuery({
    queryKey: [FINANCES, 'transfers', filters],
    queryFn: async () =>
      unwrap(await api.GET('/api/finances/transfers/', { params: { query: filters } })),
    placeholderData: keepPreviousData,
  })
}

export function useTransfer(id: number) {
  return useQuery({
    queryKey: [FINANCES, 'transfer', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/finances/transfers/{id}/', { params: { path: { id } } })),
  })
}

export function useCreateTransfer() {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (body: TransferInput) =>
      unwrap(await api.POST('/api/finances/transfers/', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateTransfer(id: number) {
  const invalidate = useInvalidateFinances()
  return useMutation({
    mutationFn: async (body: TransferInput) =>
      unwrap(await api.PATCH('/api/finances/transfers/{id}/', { params: { path: { id } }, body })),
    onSuccess: invalidate,
  })
}

export function useDeleteTransfer(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/api/finances/transfers/{id}/', { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [FINANCES], refetchType: 'none' }),
  })
}
