import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { errorMessage } from '../api/errors'
import { Alert } from '../components/Alert'
import { LinkButton } from '../components/Button'
import { TextField } from '../components/TextField'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useFoods } from '../nutrition/hooks'

// /nutrition/foods: the household's foods with nutrition per 100 g, searchable by name.
export function FoodsPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const foods = useFoods(useDebouncedValue(search.trim()))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-64">
          <TextField
            label={t('nutrition.foods.search')}
            type="search"
            autoComplete="off"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <LinkButton to="/nutrition/foods/new">{t('nutrition.foods.new')}</LinkButton>
      </div>

      {foods.isPending && <p className="text-sm text-slate-600">{t('common.loading')}</p>}
      {foods.isError && <Alert tone="error">{errorMessage(foods.error, t)}</Alert>}
      {foods.data?.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          {search ? t('nutrition.diary.noFoodFound') : t('nutrition.foods.empty')}
        </p>
      )}
      {foods.data && foods.data.length > 0 && (
        <ul
          className={`divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white ${
            foods.isPlaceholderData ? 'opacity-60' : ''
          }`}
        >
          {foods.data.map((food) => (
            <li key={food.id}>
              <Link
                to={`/nutrition/foods/${food.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{food.name}</span>
                  <span className="block text-xs text-slate-500">
                    {t('nutrition.diary.macros', {
                      protein: food.protein,
                      carbs: food.carbs,
                      fat: food.fat,
                    })}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {t('nutrition.per100', { kcal: food.calories })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
