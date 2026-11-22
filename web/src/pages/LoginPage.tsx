import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { publicApi } from '../api/client'
import { ROOT_ERROR, showApiError } from '../api/errors'
import { ResendVerification } from '../auth/ResendVerification'
import { loginSchema } from '../auth/schemas'
import { setTokens } from '../auth/tokens'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'

export function LoginPage() {
  const { t } = useTranslation()
  // `t` changes when the language changes, so the schema (and its messages) is rebuilt only then.
  const schema = useMemo(() => loginSchema(t), [t])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  // Set when the password was right but the email isn't confirmed yet: offers a new link to it.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)

  // handleSubmit runs the schema first and calls this only with valid values (like form.is_valid()).
  const onSubmit = handleSubmit(async (values) => {
    setUnverifiedEmail(null)
    try {
      const { data, error, response } = await publicApi.POST('/api/auth/token/', { body: values })
      if (data) {
        // That's all: the tokens module notifies AuthLayout, which redirects to the app.
        setTokens(data)
      } else if (response.status === 401 && errorCode(error) === 'email_not_verified') {
        setUnverifiedEmail(values.email)
      } else if (response.status === 401) {
        setError(ROOT_ERROR, { message: t('auth.login.invalidCredentials') })
      } else {
        showApiError(setError, response.status, error, ['email', 'password'], t)
      }
    } catch {
      setError(ROOT_ERROR, { message: t('errors.network') }) // fetch failed: API down or offline
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('auth.login.title')}</h1>
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      {unverifiedEmail && (
        <>
          <Alert tone="info">{t('auth.verify.notVerified')}</Alert>
          <ResendVerification email={unverifiedEmail} />
        </>
      )}
      <TextField
        label={t('auth.fields.email')}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label={t('auth.fields.password')}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('common.sending') : t('auth.login.submit')}
      </Button>
      <div className="flex flex-col gap-1 text-sm text-slate-600">
        <TextLink to="/forgot-password">{t('auth.login.forgotPassword')}</TextLink>
        <span>
          {t('auth.login.noAccount')}{' '}
          <TextLink to="/register">{t('auth.login.toRegister')}</TextLink>
        </span>
      </div>
    </form>
  )
}

// The machine-readable `code` of an API error body ({"detail": "...", "code": "email_not_verified"}).
function errorCode(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'code' in body ? body.code : undefined
}
