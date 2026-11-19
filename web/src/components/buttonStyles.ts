// Shared by <Button> and <LinkButton>, so a link can look exactly like a button.
const VARIANTS = {
  // The logo's blue for the main action; its hover a shade darker. A soft shadow in the same hue.
  primary: 'bg-brand-500 text-white shadow-sm shadow-brand-500/30 hover:bg-brand-600',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
}

export type ButtonVariant = keyof typeof VARIANTS

export function buttonClasses(variant: ButtonVariant, extra = ''): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${extra}`
}
