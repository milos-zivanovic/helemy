import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TextField } from '../components/TextField'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { type Food, useFoods } from './hooks'

/**
 * A search box for foods: typing asks the API (`?search=`, debounced) and shows matches below; picking
 * one calls onPick. Works with any number of foods, unlike a <select> holding all of them.
 */
export function FoodPicker({
  picked,
  onPick,
  error,
}: {
  picked: Food | null
  onPick: (food: Food | null) => void
  error?: string
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const query = useDebouncedValue(text.trim())
  const foods = useFoods(query, 10)
  const matches = open && query.length > 0 ? (foods.data ?? []) : []

  return (
    <div className="relative">
      <TextField
        label={t('nutrition.fields.food')}
        autoComplete="off"
        placeholder={t('nutrition.diary.searchFood')}
        error={error}
        // Showing the picked food's name; typing again starts a new search and clears the pick.
        value={picked && !open ? picked.name : text}
        onChange={(event) => {
          setText(event.target.value)
          setOpen(true)
          if (picked) onPick(null)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {matches.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100"
                // mousedown comes before the input's blur: keep the focus so the click lands
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(food)
                  setText(food.name)
                  setOpen(false)
                }}
              >
                <span className="truncate font-medium">{food.name}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {t('nutrition.per100', { kcal: food.calories })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.length > 0 && foods.data?.length === 0 && !foods.isPlaceholderData && (
        <p className="mt-1 text-xs text-slate-500">{t('nutrition.diary.noFoodFound')}</p>
      )}
    </div>
  )
}
