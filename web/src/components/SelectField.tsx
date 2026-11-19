import { type ComponentProps, useId } from 'react'

type SelectFieldProps = ComponentProps<'select'> & {
  label: string
  error?: string
}

// Like TextField, for a <select>. The options come as children (<option>, <optgroup>).
export function SelectField({ label, error, id, children, ...selectProps }: SelectFieldProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const errorId = `${selectId}-error`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="focus:border-brand-400 focus:ring-brand-100 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-xs transition outline-none focus:ring-3 aria-invalid:border-red-400"
        {...selectProps}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
