import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from './Button'

type ConfirmButtonProps = {
  children: ReactNode
  question: string // e.g. "Remove Ana from the household?"
  onConfirm: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}

// A button that asks "Are you sure?" in place before doing something that can't be undone. The
// `asking` state is local to each instance: two ConfirmButtons on a page don't affect each other.
export function ConfirmButton({
  children,
  question,
  onConfirm,
  variant = 'secondary',
  disabled,
}: ConfirmButtonProps) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <Button variant={variant} disabled={disabled} onClick={() => setAsking(true)}>
        {children}
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">{question}</span>
      <Button
        variant={variant === 'secondary' ? 'primary' : variant}
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {t('common.yes')}
      </Button>
      <Button variant="secondary" onClick={() => setAsking(false)}>
        {t('common.no')}
      </Button>
    </div>
  )
}
