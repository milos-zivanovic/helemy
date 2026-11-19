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
    <div className="min-w-0 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100 sm:p-4">
      <dt className="truncate text-xs font-medium text-slate-500">{label}</dt>
      {/* break-words: on a narrow phone "150.000 RSD" wraps under itself instead of being cut */}
      <dd
        className={`mt-1 text-sm leading-snug font-semibold break-words tabular-nums sm:text-lg ${tone}`}
      >
        {value}
      </dd>
    </div>
  )
}
