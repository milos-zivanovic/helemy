import type { ComponentProps } from 'react'

// A checkbox with its label to the right; the whole label is clickable.
export function CheckboxField({
  label,
  ...inputProps
}: ComponentProps<'input'> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" className="size-4 rounded border-slate-300" {...inputProps} />
      {label}
    </label>
  )
}
