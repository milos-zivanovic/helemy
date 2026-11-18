import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'

import { publicApi } from '../api/client'
import { ROOT_ERROR, showApiError } from '../api/errors'
import { resetPasswordSchema } from '../auth/schemas'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'

// Opened from the reset email: /reset-password?uid=...&token=... (the API's PASSWORD_RESET_URL).
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams() // like request.GET
  const uid = searchParams.get('uid')
  const token = searchParams.get('token')

  const schema = useMemo(() => resetPasswordSchema(t), [t])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { new_password: '', password_confirm: '' },
  })
  const [done, setDone] = useState(false)
  const [linkInvalid, setLinkInvalid] = useState(false)

  const onSubmit = handleSubmit(async ({ new_password }) => {
    if (uid === null || token === null) return
    try {
      const { error, response } = await publicApi.POST('/api/auth/password/reset/confirm/', {
        body: { uid, token, new_password },
      })
      if (response.ok) {
        setDone(true)
      } else if (
        response.status === 400 &&
        typeof error === 'object' &&
        error &&
        'token' in error
      ) {
        setLinkInvalid(true) // used, expired or tampered with
      } else {
        showApiError(setError, response.status, error, ['new_password'], t)
      }
    } catch {
      setError(ROOT_ERROR, { message: t('errors.network') })
    }
  })

  let content
  if (done) {
    content = (
      <>
        <Alert tone="success">{t('auth.reset.done')}</Alert>
        <TextLink to="/login" className="text-sm">
          {t('auth.backToLogin')}
        </TextLink>
      </>
    )
  } else if (uid === null || token === null || linkInvalid) {
    content = (
      <>
        <Alert tone="error">{t('auth.reset.invalidLink')}</Alert>
        <TextLink to="/forgot-password" className="text-sm">
          {t('auth.reset.requestNew')}
        </TextLink>
      </>
    )
  } else {
    content = (
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
        <TextField
          label={t('auth.fields.newPassword')}
          type="password"
          autoComplete="new-password"
          error={errors.new_password?.message}
          {...register('new_password')}
        />
        <TextField
          label={t('auth.fields.passwordConfirm')}
          type="password"
          autoComplete="new-password"
          error={errors.password_confirm?.message}
          {...register('password_confirm')}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.sending') : t('auth.reset.submit')}
        </Button>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('auth.reset.title')}</h1>
      {content}
    </div>
  )
}
