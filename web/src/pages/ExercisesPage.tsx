import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { errorMessage } from '../api/errors'
import { Alert } from '../components/Alert'
import { LinkButton } from '../components/Button'
import { type ExerciseListItem, useExercises } from '../fitness/hooks'

// /fitness/exercises: the household's exercises grouped by muscle group (the API already sorts them
// by the group's order, then by name).
export function ExercisesPage() {
  const { t } = useTranslation()
  const exercises = useExercises()

  if (exercises.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (exercises.isError) return <Alert tone="error">{errorMessage(exercises.error, t)}</Alert>

  const groups: [string, ExerciseListItem[]][] = []
  for (const exercise of exercises.data) {
    const name = exercise.muscle_group?.name ?? t('fitness.exercises.noMuscleGroup')
    if (groups.at(-1)?.[0] === name) groups.at(-1)![1].push(exercise)
    else groups.push([name, [exercise]])
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <LinkButton to="/fitness/exercises/new">{t('fitness.exercises.new')}</LinkButton>
      </div>
      {groups.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          {t('fitness.exercises.empty')}
        </p>
      )}
      {groups.map(([name, items]) => (
        <section key={name}>
          <h2 className="mb-1 px-1 text-xs font-medium text-slate-500">{name}</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {items.map((exercise) => (
              <li key={exercise.id}>
                <Link
                  to={`/fitness/exercises/${exercise.id}`}
                  className="block px-4 py-3 text-sm font-medium hover:bg-slate-50"
                >
                  {exercise.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
