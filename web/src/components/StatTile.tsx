// One headline number with its label ("Expenses · 48.200,00 RSD"). Several in a row form a KPI row.
export function StatTile({
  label,
  value,
  tone = 'text-slate-900',
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-1 truncate text-sm font-semibold sm:text-base ${tone}`}>{value}</dd>
    </div>
  )
}
