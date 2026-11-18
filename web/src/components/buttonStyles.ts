// Shared by <Button> and <LinkButton>, so a link can look exactly like a button.
const VARIANTS = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
  danger: 'bg-red-700 text-white hover:bg-red-600',
}

export type ButtonVariant = keyof typeof VARIANTS

export function buttonClasses(variant: ButtonVariant, extra = ''): string {
  return `inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${extra}`
}
