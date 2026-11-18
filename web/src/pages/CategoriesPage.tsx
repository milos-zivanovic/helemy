import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { z } from 'zod'

import { ApiError, errorMessage, showMutationError } from '../api/errors'
import type { components } from '../api/schema'
import { Alert } from '../components/Alert'
import { Button, LinkButton } from '../components/Button'
import { ConfirmButton } from '../components/ConfirmButton'
import { TextField } from '../components/TextField'
import { CategoryRules } from '../finances/CategoryRules'
import {
  useCategories,
  useCategoryGroups,
  useCreateCategoryGroup,
  useDeleteCategoryGroup,
  useUpdateCategoryGroup,
} from '../finances/hooks'

type Group = components['schemas']['CategoryGroup']
type Category = components['schemas']['CategoryListItem']

// /finances/categories: category groups as cards, each with its categories. Groups are edited in
// place (just a name); a category has more fields and gets its own page.
export function CategoriesPage() {
  const { t } = useTranslation()
  const groups = useCategoryGroups()
  const categories = useCategories()
  const [creatingGroup, setCreatingGroup] = useState(false)

  if (groups.isPending || categories.isPending) {
    return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  }
  if (groups.isError || categories.isError) {
    return <Alert tone="error">{errorMessage(groups.error ?? categories.error, t)}</Alert>
  }

  // Group the flat category list by group id once, instead of filtering it per card.
  const byGroup = new Map<number, Category[]>()
  for (const category of categories.data) {
    byGroup.set(category.category_group, [
      ...(byGroup.get(category.category_group) ?? []),
      category,
    ])
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">{t('finances.categories.intro')}</p>
      {creatingGroup ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <GroupNameForm onDone={() => setCreatingGroup(false)} />
        </div>
      ) : (
        <Button className="self-start" onClick={() => setCreatingGroup(true)}>
          {t('finances.categories.newGroup')}
        </Button>
      )}
      {groups.data.map((group) => (
        <GroupCard key={group.id} group={group} categories={byGroup.get(group.id) ?? []} />
      ))}
    </div>
  )
}

function GroupCard({ group, categories }: { group: Group; categories: Category[] }) {
  const { t } = useTranslation()
  const [renaming, setRenaming] = useState(false)
  const update = useUpdateCategoryGroup()
  const remove = useDeleteCategoryGroup()
  const isActive = group.is_active ?? true

  // A 400 on delete means "still has transactions": say it in the app's language.
  const deleteError =
    remove.error instanceof ApiError && remove.error.status === 400
      ? t('finances.categories.groupInUse')
      : remove.error && errorMessage(remove.error, t)
  const error = deleteError || (update.error && errorMessage(update.error, t))

  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white p-4 ${isActive ? '' : 'opacity-70'}`}
    >
      {renaming ? (
        <GroupNameForm group={group} onDone={() => setRenaming(false)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {group.name}
            {!isActive && <Badge>{t('finances.categories.off')}</Badge>}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setRenaming(true)}>
              {t('household.details.rename')}
            </Button>
            <Button
              variant="secondary"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: group.id, is_active: !isActive })}
            >
              {isActive ? t('finances.categories.switchOff') : t('finances.categories.switchOn')}
            </Button>
            <ConfirmButton
              variant="danger"
              question={t('finances.categories.deleteGroupConfirm')}
              disabled={remove.isPending}
              onConfirm={() => remove.mutate(group.id)}
            >
              {t('common.delete')}
            </ConfirmButton>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <ul className="mt-3 divide-y divide-slate-100">
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} />
        ))}
        {categories.length === 0 && (
          <li className="py-2 text-sm text-slate-500">{t('finances.categories.emptyGroup')}</li>
        )}
      </ul>
      <LinkButton
        variant="secondary"
        className="mt-3"
        // ?group= preselects the group in the form, like a prefilled initial= in a Django form
        to={`/finances/categories/new?group=${group.id}`}
      >
        {t('finances.categories.newCategory')}
      </LinkButton>
    </section>
  )
}

function CategoryRow({ category }: { category: Category }) {
  const { t } = useTranslation()
  let status: string | null = null
  if (!category.is_active) status = t('finances.categories.off')
  else if (!category.active_today) status = t('finances.categories.inactiveToday')

  return (
    <li>
      <Link
        to={`/finances/categories/${category.id}`}
        className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-2 hover:bg-slate-50"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {category.name}
            {category.is_transfer && <Badge>{t('finances.categories.transferBadge')}</Badge>}
            {status && <Badge>{status}</Badge>}
          </span>
          <span className="block text-xs text-slate-500">
            <CategoryRules category={category} />
          </span>
        </span>
        <span className="shrink-0 text-xs text-slate-500">
          {t('finances.categories.transactionsCount', { n: category.transactions_count })}
        </span>
      </Link>
    </li>
  )
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
      {children}
    </span>
  )
}

/** Create a group (no `group`) or rename one. */
function GroupNameForm({ group, onDone }: { group?: Group; onDone: () => void }) {
  const { t } = useTranslation()
  const create = useCreateCategoryGroup()
  const update = useUpdateCategoryGroup()
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('validation.required'))
          .max(100, t('validation.maxLength', { max: 100 })),
      }),
    [t],
  )
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { name: group?.name ?? '' } })

  const onSubmit = handleSubmit(async ({ name }) => {
    try {
      if (group) await update.mutateAsync({ id: group.id, name })
      else await create.mutateAsync(name)
      onDone()
    } catch (error) {
      showMutationError(setError, error, ['name'], t)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <TextField
        label={t('finances.categories.groupName')}
        autoFocus
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="flex gap-2">
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
