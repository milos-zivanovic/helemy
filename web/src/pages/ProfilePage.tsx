import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import { showMutationError, unwrap } from '../api/errors'
import { AvatarEditor } from '../auth/AvatarEditor'
import { ProfileForm } from '../auth/ProfileForm'
import { changePasswordSchema } from '../auth/schemas'
import { setTokens } from '../auth/tokens'
import { useMe } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { TextField } from '../components/TextField'
import { useFormatters } from '../i18n/format'

// /profile: name and preferences (ProfileForm) and password change.
export function ProfilePage() {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const { formatDate } = useFormatters()
  if (!me) return null // AppLayout renders pages only after the profile has loaded

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('profile.title')}
          </h1>
          <p className="truncate text-sm text-slate-500">{me.full_name}</p>
        </div>
        <AvatarEditor />
      </div>
      {/* Side by side from a laptop up */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card title={t('profile.account')}>
          <ProfileForm />
          <p className="mt-4 text-xs text-slate-500">
            {t('profile.memberSince')}: {formatDate(me.date_joined)}
          </p>
        </Card>
        <Card title={t('profile.password.title')}>
          <ChangePasswordForm />
        </Card>
      </div>
    </div>
  )
}

function ChangePasswordForm() {
  const { t } = useTranslation()
  const schema = useMemo(() => changePasswordSchema(t), [t])
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { old_password: '', new_password: '', password_confirm: '' },
  })
  const [changed, setChanged] = useState(false)

  const onSubmit = handleSubmit(async ({ old_password, new_password }) => {
    setChanged(false)
    try {
      const tokens = unwrap(
        await api.POST('/api/auth/password/change/', { body: { old_password, new_password } }),
      )
      // The API logged out every session, this one too (its refresh token is blacklisted), and sent
      // a new pair for this browser. Without storing it, the next refresh would fail and log us out.
      setTokens(tokens)
      setChanged(true)
      reset() // passwords shouldn't stay in the fields
    } catch (error) {
      showMutationError(setError, error, ['old_password', 'new_password'], t)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-sm flex-col gap-4">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      {changed && <Alert tone="success">{t('profile.password.changed')}</Alert>}
      <TextField
        label={t('profile.password.current')}
        type="password"
        autoComplete="current-password"
        error={errors.old_password?.message}
        {...register('old_password')}
      />
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
      <p className="text-xs text-slate-500">{t('profile.password.info')}</p>
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? t('common.sending') : t('profile.password.submit')}
      </Button>
    </form>
  )
}
