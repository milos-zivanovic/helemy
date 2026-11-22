import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import { showMutationError, unwrap } from '../api/errors'
import type { components } from '../api/schema'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { FITNESS } from '../fitness/hooks'
import { API_LANGUAGES, fromApiLanguage, LANGUAGES, type Language } from '../i18n'
import { WEIGHT_UNITS } from '../i18n/format'
import { profileSchema } from './schemas'
import { ME_QUERY_KEY, useMe } from './useAuth'

type Currency = components['schemas']['CurrencyEnum']

// The API's list (users.models.CURRENCIES). The generated types check it: a code the API doesn't
// accept is a type error here.
const CURRENCIES: Currency[] = ['RSD', 'EUR', 'USD', 'CHF', 'GBP', 'BAM', 'HUF']

// Every IANA time zone the browser knows ("Europe/Belgrade"), read once when the file loads.
const TIME_ZONES = Intl.supportedValuesOf('timeZone')

const FIELDS = [
  'first_name',
  'last_name',
  'currency',
  'timezone',
  'language',
  'weight_unit',
] as const

// Name and preferences of the logged-in user: PATCH /api/auth/me/. The email (the login) isn't here.
export function ProfileForm() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const schema = useMemo(() => profileSchema(t), [t])
  const [saved, setSaved] = useState(false)

  // The form's values follow the profile (`values` instead of `defaultValues`): when it changes
  // after a save, the fields show what the API stored.
  const values = useMemo(
    () =>
      me && {
        first_name: me.first_name ?? '',
        last_name: me.last_name ?? '',
        // The profile says `string`; a code the select doesn't offer falls back to the default.
        currency: CURRENCIES.find((code) => code === me.currency) ?? 'RSD',
        timezone: me.timezone || 'Europe/Belgrade',
        language: API_LANGUAGES[fromApiLanguage(me.language) ?? 'en'],
        weight_unit: me.weight_unit ?? 'kg',
      },
    [me],
  )
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ resolver: zodResolver(schema), values })

  // A zone stored before that this browser doesn't list (e.g. "UTC" in Chrome) stays selectable.
  const timeZones = useMemo(
    () =>
      values && !TIME_ZONES.includes(values.timezone)
        ? [values.timezone, ...TIME_ZONES]
        : TIME_ZONES,
    [values],
  )

  const onSubmit = handleSubmit(async (body) => {
    setSaved(false)
    try {
      const profile = unwrap(await api.PATCH('/api/auth/me/', { body }))
      // The answer is the whole profile: into the cache, so every page (and the form) shows it.
      // A changed language switches the app too (useSyncLanguage in AppLayout).
      queryClient.setQueryData(ME_QUERY_KEY, profile)
      // Training totals are computed by the API in the user's unit: a new unit makes them stale.
      if (profile.weight_unit !== me?.weight_unit) {
        void queryClient.invalidateQueries({ queryKey: [FITNESS] })
      }
      setSaved(true)
    } catch (error) {
      showMutationError(setError, error, FIELDS, t)
    }
  })

  if (!me) return null

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      {saved && !isDirty && <Alert tone="success">{t('profile.saved')}</Alert>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-500">{t('auth.fields.email')}</dt>
        <dd className="min-w-0 truncate">{me.email}</dd>
      </dl>
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
        <SelectField
          label={t('profile.currency')}
          error={errors.currency?.message}
          {...register('currency')}
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('profile.language')}
          error={errors.language?.message}
          {...register('language')}
        >
          {(Object.keys(LANGUAGES) as Language[]).map((code) => (
            <option key={code} value={API_LANGUAGES[code]}>
              {LANGUAGES[code]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('profile.weightUnit')}
          error={errors.weight_unit?.message}
          {...register('weight_unit')}
        >
          {WEIGHT_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {t(`units.${unit}Name`)}
            </option>
          ))}
        </SelectField>
        <div className="sm:col-span-2">
          <SelectField
            label={t('profile.timezone')}
            error={errors.timezone?.message}
            {...register('timezone')}
          >
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-xs text-slate-500">
        <p>{t('profile.currencyInfo')}</p>
        <p>{t('profile.weightUnitInfo')}</p>
      </div>
      <Button type="submit" disabled={isSubmitting || !isDirty} className="self-start">
        {isSubmitting ? t('common.sending') : t('common.save')}
      </Button>
    </form>
  )
}
