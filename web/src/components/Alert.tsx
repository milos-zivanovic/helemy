import type { ReactNode } from 'react'

const TONES = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-green-200 bg-green-50 text-green-800',
  info: 'border-brand-100 bg-brand-50 text-brand-700',
}

// A message box, like Django's messages framework rendered in a template.
export function Alert({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border p-3 text-sm ${TONES[tone]}`}
    >
      {children}
    </div>
  )
}
