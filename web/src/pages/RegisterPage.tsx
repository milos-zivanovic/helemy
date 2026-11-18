import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { publicApi } from '../api/client'
import { ROOT_ERROR, showApiError } from '../api/errors'
import { registerSchema } from '../auth/schemas'
import { setTokens } from '../auth/tokens'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'

export function RegisterPage() {
  const { t } = useTranslation()
  const schema = useMemo(() => registerSchema(t), [t])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', first_name: '', last_name: '', password: '', password_confirm: '' },
  })

  const onSubmit = handleSubmit(async ({ email, first_name, last_name, password }) => {
    // password_confirm stays in the browser; the API gets only the fields it knows.
    const body = { email, first_name, last_name, password }
    try {
      const { data, error, response } = await publicApi.POST('/api/auth/register/', { body })
      if (data) {
        // Sign up returns tokens too, so the user is logged in right away; AuthLayout redirects.
        setTokens(data)
      } else {
        showApiError(
          setError,
          response.status,
          error,
          ['email', 'first_name', 'last_name', 'password'],
          t,
        )
      }
    } catch {
      setError(ROOT_ERROR, { message: t('errors.network') })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('auth.register.title')}</h1>
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <TextField
        label={t('auth.fields.email')}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label={t('auth.fields.firstName')}
          autoComplete="given-name"
          error={errors.first_name?.message}
          {...register('first_name')}
        />
        <TextField
          label={t('auth.fields.lastName')}
          autoComplete="family-name"
          error={errors.last_name?.message}
          {...register('last_name')}
        />
      </div>
      <TextField
        label={t('auth.fields.password')}
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <TextField
        label={t('auth.fields.passwordConfirm')}
        type="password"
        autoComplete="new-password"
        error={errors.password_confirm?.message}
        {...register('password_confirm')}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('common.sending') : t('auth.register.submit')}
      </Button>
      <p className="text-sm text-slate-600">
        {t('auth.register.haveAccount')}{' '}
        <TextLink to="/login">{t('auth.register.toLogin')}</TextLink>
      </p>
    </form>
  )
}
