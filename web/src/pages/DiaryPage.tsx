import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { z } from 'zod'

import { errorMessage, showMutationError } from '../api/errors'
import { useMe } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { StatTile } from '../components/StatTile'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'
import { useFormatters } from '../i18n/format'
import { isDay, shiftDay, today } from '../lib/dates'
import { FoodPicker } from '../nutrition/FoodPicker'
import {
  type Consumption,
  type DaySummary,
  type Food,
  useCreateEntry,
  useDayEntries,
  useDeleteEntry,
  useUpdateEntry,
  useWeek,
} from '../nutrition/hooks'
import { entrySchema, gramsField } from '../nutrition/schemas'

// /nutrition/diary?date=2026-11-18: one day of the diary (default today) and its week.
export function DiaryPage() {
  const { t } = useTranslation()
  const { formatDay } = useFormatters()
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('date')
  const date = isDay(param) ? param : today()
  const goTo = (day: string) => setSearchParams(day === today() ? {} : { date: day })

  const { data: me } = useMe()
  const week = useWeek(date)
  // The day's totals come from the week summary: the API sums them (per member).
  const mine = (day: DaySummary) => day.by_user.find((member) => member.user_id === me?.id)
  const dayTotals = week.data?.find((day) => day.date === date)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            aria-label={t('nutrition.diary.previousDay')}
            onClick={() => goTo(shiftDay(date, -1))}
          >
            ‹
          </Button>
          <span className="min-w-48 text-center font-medium capitalize">{formatDay(date)}</span>
          <Button
            variant="secondary"
            aria-label={t('nutrition.diary.nextDay')}
            onClick={() => goTo(shiftDay(date, 1))}
          >
            ›
          </Button>
        </div>
        {date !== today() && (
          <Button variant="secondary" onClick={() => goTo(today())}>
            {t('nutrition.diary.today')}
          </Button>
        )}
      </div>

      <Totals totals={dayTotals ? mine(dayTotals) : undefined} />

      {/* From a laptop up: the day on the left (add + entries), the week beside it */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
        <div className="flex flex-col gap-4 xl:col-span-3">
          <Card title={t('nutrition.diary.add')}>
            {/* key: switching days starts a fresh form */}
            <AddEntryForm key={date} date={date} />
          </Card>
          <Entries date={date} />
        </div>
        <div className="flex flex-col gap-4 xl:col-span-2">
          {week.isError && <Alert tone="error">{errorMessage(week.error, t)}</Alert>}
          {week.data && <WeekTable days={week.data} selected={date} mine={mine} onSelect={goTo} />}
        </div>
      </div>
    </div>
  )
}

function Totals({
  totals,
}: {
  totals?: { calories: number; protein: number; carbs: number; fat: number }
}) {
  const { t } = useTranslation()
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label={t('nutrition.fields.calories')} value={`${totals?.calories ?? 0} kcal`} />
      <StatTile label={t('nutrition.fields.protein')} value={`${totals?.protein ?? 0} g`} />
      <StatTile label={t('nutrition.fields.carbs')} value={`${totals?.carbs ?? 0} g`} />
      <StatTile label={t('nutrition.fields.fat')} value={`${totals?.fat ?? 0} g`} />
    </dl>
  )
}

function AddEntryForm({ date }: { date: string }) {
  const { t } = useTranslation()
  const create = useCreateEntry()
  const [food, setFood] = useState<Food | null>(null)
  const [added, setAdded] = useState(0)
  const schema = useMemo(() => entrySchema(t), [t])
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { food_id: '', quantity_grams: '' } })
  const grams = Number(useWatch({ control, name: 'quantity_grams' })) || 0

  const pick = (picked: Food | null) => {
    setFood(picked)
    // The picker isn't a registered input: put its value into the form from code.
    setValue('food_id', picked ? String(picked.id) : '', { shouldValidate: picked !== null })
  }

  const submit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync({ ...values, date })
      reset({ food_id: '', quantity_grams: '' })
      setFood(null)
      setAdded((n) => n + 1) // a new key below: the picker starts over with an empty search box
    } catch (error) {
      showMutationError(setError, error, ['food_id', 'quantity_grams'], t)
    }
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <FoodPicker key={added} picked={food} onPick={pick} error={errors.food_id?.message} />
      <div className="flex flex-wrap items-start gap-2">
        <div className="w-32">
          <TextField
            label={t('nutrition.fields.grams')}
            inputMode="numeric"
            autoComplete="off"
            error={errors.quantity_grams?.message}
            {...register('quantity_grams')}
          />
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('common.sending') : t('nutrition.diary.addButton')}
          </Button>
          {/* A preview of what the entry adds, computed like the API: per 100 g × grams / 100 */}
          {food && grams > 0 && (
            <span className="text-sm text-slate-600">
              ≈ {Math.round((food.calories * grams) / 100)} kcal
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {t('nutrition.diary.missingFood')}{' '}
        <TextLink to="/nutrition/foods/new">{t('nutrition.foods.new')}</TextLink>
      </p>
    </form>
  )
}

function Entries({ date }: { date: string }) {
  const { t } = useTranslation()
  const entries = useDayEntries(date)

  if (entries.isError) return <Alert tone="error">{errorMessage(entries.error, t)}</Alert>
  if (!entries.data) return null
  if (entries.data.length === 0) {
    return (
      <p className="surface p-8 text-center text-sm text-slate-500">{t('nutrition.diary.empty')}</p>
    )
  }

  return (
    <ul
      className={`surface divide-y divide-slate-100 ${
        entries.isPlaceholderData ? 'opacity-60' : ''
      }`}
    >
      {entries.data.map((entry) => (
        <EntryRow key={entry.id} entry={entry} />
      ))}
    </ul>
  )
}

// One entry: food, grams and what it adds; the grams can be corrected in place.
function EntryRow({ entry }: { entry: Consumption }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const remove = useDeleteEntry()

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{entry.food_name}</span>
        <span className="block text-xs text-slate-500">
          {t('nutrition.diary.macros', {
            protein: entry.protein,
            carbs: entry.carbs,
            fat: entry.fat,
          })}
        </span>
      </span>
      {editing ? (
        <GramsEditor entry={entry} onDone={() => setEditing(false)} />
      ) : (
        <span className="flex items-center gap-2">
          <span className="text-right text-sm">
            <span className="font-semibold">{entry.calories} kcal</span>
            <span className="block text-xs text-slate-500">{entry.quantity_grams} g</span>
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            onClick={() => setEditing(true)}
          >
            {t('nutrition.diary.editGrams')}
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
            disabled={remove.isPending}
            aria-label={t('nutrition.diary.deleteEntry', { food: entry.food_name })}
            onClick={() => remove.mutate(entry.id)}
          >
            ✕
          </button>
        </span>
      )}
    </li>
  )
}

function GramsEditor({ entry, onDone }: { entry: Consumption; onDone: () => void }) {
  const { t } = useTranslation()
  const update = useUpdateEntry()
  const schema = useMemo(() => z.object({ quantity_grams: gramsField(t) }), [t])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { quantity_grams: String(entry.quantity_grams) },
  })

  const submit = handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ id: entry.id, quantity_grams: values.quantity_grams })
      onDone()
    } catch (error) {
      showMutationError(setError, error, ['quantity_grams'], t)
    }
  })

  return (
    <form onSubmit={submit} noValidate className="flex items-start gap-2">
      <div className="w-24">
        <TextField
          label={t('nutrition.fields.grams')}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          error={errors.quantity_grams?.message ?? errors.root?.server?.message}
          {...register('quantity_grams')}
        />
      </div>
      <div className="mt-6 flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {t('common.save')}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}

// Monday-Sunday: the member's totals per day; a row opens that day.
function WeekTable({
  days,
  selected,
  mine,
  onSelect,
}: {
  days: DaySummary[]
  selected: string
  mine: (
    day: DaySummary,
  ) => { calories: number; protein: number; carbs: number; fat: number } | undefined
  onSelect: (day: string) => void
}) {
  const { t } = useTranslation()
  const { formatShortDate } = useFormatters()
  const { formatWeekday } = useWeekday()

  return (
    <Card title={t('nutrition.diary.week')}>
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="px-2 py-1 font-medium">{t('nutrition.diary.day')}</th>
              <th className="px-2 py-1 text-right font-medium">kcal</th>
              <th className="px-2 py-1 text-right font-medium">{t('nutrition.short.protein')}</th>
              <th className="px-2 py-1 text-right font-medium">{t('nutrition.short.carbs')}</th>
              <th className="px-2 py-1 text-right font-medium">{t('nutrition.short.fat')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {days.map((day) => {
              const totals = mine(day)
              return (
                <tr
                  key={day.date}
                  className={`cursor-pointer hover:bg-slate-50 ${day.date === selected ? 'bg-brand-50 text-brand-700 font-medium' : ''}`}
                  onClick={() => onSelect(day.date)}
                >
                  <td className="px-2 py-1.5">
                    <span className="capitalize">{formatWeekday(day.date)}</span>{' '}
                    <span className="text-xs text-slate-500">{formatShortDate(day.date)}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">{totals?.calories ?? 0}</td>
                  <td className="px-2 py-1.5 text-right">{totals?.protein ?? 0}</td>
                  <td className="px-2 py-1.5 text-right">{totals?.carbs ?? 0}</td>
                  <td className="px-2 py-1.5 text-right">{totals?.fat ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// Short weekday name in the current language: "pon", "Mon".
function useWeekday() {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'sr-Latn-RS'
  return {
    formatWeekday: (day: string) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(`${day}T00:00`)),
  }
}
