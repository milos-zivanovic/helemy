import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router'

import { errorMessage } from '../api/errors'
import { Alert } from '../components/Alert'
import { Card } from '../components/Card'
import { ConfirmButton } from '../components/ConfirmButton'
import { TextLink } from '../components/TextLink'
import {
  type TransactionInput,
  useAccounts,
  useCreateTransaction,
  useDeleteTransaction,
  useTransaction,
  useUpdateTransaction,
} from '../finances/hooks'
import { TransactionForm } from '../finances/TransactionForm'
import { today } from '../lib/dates'

const LIST = '/finances/transactions'

// The list passes its query string (?month=...&type=...) in the link's state, so saving or
// cancelling returns to the same filtered list; opened directly, it falls back to the item's month.
type BackState = { back?: string } | null

function useBackToList() {
  const navigate = useNavigate()
  const back = (useLocation().state as BackState)?.back
  return (date?: string) => {
    void navigate(back ?? (date ? `${LIST}?month=${date.slice(0, 7)}` : LIST))
  }
}

/** /finances/transactions/new */
export function NewTransactionPage() {
  const { t } = useTranslation()
  const create = useCreateTransaction()
  const backToList = useBackToList()
  // The form's default account (the first active one) must be known before the form is created:
  // defaultValues are read once, on the first render, like a Django form's `initial`.
  const accounts = useAccounts()

  const onSubmit = async (values: TransactionInput) => {
    await create.mutateAsync(values)
    backToList(values.date)
  }

  if (accounts.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (accounts.isError) return <Alert tone="error">{errorMessage(accounts.error, t)}</Alert>
  const firstActive = accounts.data.find((account) => account.is_active)
  if (!firstActive) {
    return (
      <Alert tone="info">
        {t('finances.accounts.noneActive')}{' '}
        <TextLink to="/finances/accounts/new">{t('finances.accounts.new')}</TextLink>
      </Alert>
    )
  }

  return (
    <Card title={t('finances.transactions.new')}>
      <TransactionForm
        withSuggestions
        submitLabel={t('common.save')}
        onSubmit={onSubmit}
        defaultValues={{
          transaction_type: 'expense',
          title: '',
          amount: '',
          date: today(),
          category_id: '',
          account_id: String(firstActive.id),
          description: '',
          is_fixed: false,
        }}
      />
    </Card>
  )
}

/** /finances/transactions/:id */
export function EditTransactionPage() {
  const { t } = useTranslation()
  // useParams: the URL's dynamic parts, like the kwargs a Django view gets from <int:id>.
  const id = Number(useParams().id)
  const transaction = useTransaction(id)
  const update = useUpdateTransaction(id)
  const remove = useDeleteTransaction(id)
  const backToList = useBackToList()

  if (transaction.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (transaction.isError) {
    return (
      <Alert tone="error">
        {errorMessage(transaction.error, t)}{' '}
        <TextLink to={LIST}>{t('finances.transactions.backToList')}</TextLink>
      </Alert>
    )
  }

  const data = transaction.data
  const onSubmit = async (values: TransactionInput) => {
    await update.mutateAsync(values)
    backToList(values.date)
  }

  return (
    <Card title={t('finances.transactions.edit')}>
      {remove.error && (
        <div className="mb-4">
          <Alert tone="error">{errorMessage(remove.error, t)}</Alert>
        </div>
      )}
      <TransactionForm
        submitLabel={t('common.save')}
        onSubmit={onSubmit}
        currentCategory={data.category}
        currentAccount={data.account}
        defaultValues={{
          transaction_type: data.transaction_type ?? 'expense',
          title: data.title,
          amount: data.amount,
          date: data.date ?? today(),
          category_id: String(data.category.id),
          account_id: String(data.account.id),
          description: data.description ?? '',
          is_fixed: data.is_fixed ?? false,
        }}
      >
        <ConfirmButton
          variant="danger"
          question={t('finances.transactions.deleteConfirm')}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => backToList(data.date) })}
        >
          {t('common.delete')}
        </ConfirmButton>
      </TransactionForm>
    </Card>
  )
}
