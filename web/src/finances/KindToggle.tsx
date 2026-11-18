import { useTranslation } from 'react-i18next'

export type Kind = 'expense' | 'income' | 'transfer'

/** What a new entry keeps when the user switches between the transaction and the transfer form. */
export type Carry = { amount: string; date: string; description: string }

// Expense / income / transfer as radio buttons styled as one segmented control. Expense and income
// are one form (a transaction); a transfer is another (two accounts, its own API endpoint). The
// toggle sits at the top of both, so switching feels like changing a field: the page swaps the
// forms and carries the amount, date and description over.
export function KindToggle({
  value,
  onChange,
  kinds = ['expense', 'income', 'transfer'],
}: {
  value: Kind
  onChange: (kind: Kind) => void
  kinds?: Kind[]
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="flex rounded-md border border-slate-300 p-1">
      <legend className="sr-only">{t('finances.fields.type')}</legend>
      {kinds.map((kind) => (
        <label
          key={kind}
          className={`flex-1 cursor-pointer rounded px-3 py-1.5 text-center text-sm font-medium ${
            value === kind ? 'bg-slate-900 text-white' : 'text-slate-700'
          }`}
        >
          <input
            type="radio"
            name="kind"
            value={kind}
            checked={value === kind}
            onChange={() => onChange(kind)}
            className="sr-only"
          />
          {t(`finances.types.${kind}`)}
        </label>
      ))}
    </fieldset>
  )
}
