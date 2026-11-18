import type { components } from '../api/schema'

type CategoryOption = components['schemas']['CategoryList']

// <option>s grouped by category group (<optgroup>), in the API's order (group, then name).
export function CategoryOptions({ categories }: { categories: readonly CategoryOption[] }) {
  const groups = new Map<string, CategoryOption[]>()
  for (const category of categories) {
    const group = groups.get(category.category_group_name) ?? []
    group.push(category)
    groups.set(category.category_group_name, group)
  }
  return [...groups].map(([groupName, items]) => (
    <optgroup key={groupName} label={groupName}>
      {items.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </optgroup>
  ))
}
