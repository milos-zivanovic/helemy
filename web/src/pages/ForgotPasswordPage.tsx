import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { publicApi } from '../api/client'
import { ROOT_ERROR, showApiError } from '../api/errors'
import { forgotPasswordSchema } from '../auth/schemas'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const schema = useMemo(() => forgotPasswordSchema(t), [t])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } })
  // Component state: a value React remembers between renders; setSent(true) re-renders with the message.
  const [sent, setSent] = useState(false)

  const onSubmit = handleSubmit(async (body) => {
    try {
      const { error, response } = await publicApi.POST('/api/auth/password/reset/', { body })
      if (response.ok) setSent(true)
      else showApiError(setError, response.status, error, ['email'], t)
    } catch {
      setError(ROOT_ERROR, { message: t('errors.network') })
    }
  })

  // The API answers 204 whether or not the account exists, so the message can't say more than this.
  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{t('auth.forgot.title')}</h1>
        <Alert tone="success">{t('auth.forgot.sent')}</Alert>
        <TextLink to="/login" className="text-sm">
          {t('auth.backToLogin')}
        </TextLink>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('auth.forgot.title')}</h1>
      <p className="text-sm text-slate-600">{t('auth.forgot.intro')}</p>
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <TextField
        label={t('auth.fields.email')}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('common.sending') : t('auth.forgot.submit')}
      </Button>
      <TextLink to="/login" className="text-sm">
        {t('auth.backToLogin')}
      </TextLink>
    </form>
  )
}
