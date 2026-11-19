import { type ComponentProps, useId } from 'react'

type TextFieldProps = ComponentProps<'input'> & {
  label: string
  error?: string
}

// A labelled input with its error message, like one rendered field of a Django form ({{ field }} with
// label and errors). All other props, including the `ref` and `onChange` that React Hook Form's
// register() returns, go straight to the <input>.
export function TextField({ label, error, id, ...inputProps }: TextFieldProps) {
  const generatedId = useId() // unique per component instance; links <label> and error to the input
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="focus:border-brand-400 focus:ring-brand-100 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-xs transition outline-none focus:ring-3 aria-invalid:border-red-400"
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
