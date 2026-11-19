import { NavLink } from 'react-router'

export type SectionTab = {
  to: string
  label: string
  /** Set when "active" isn't simply "the URL starts with `to`" (one tab for several URLs). */
  active?: boolean
}

// The top of a section (Finances, Fitness, Nutrition): its title and tabs, the same everywhere.
// The tabs scroll sideways on a narrow phone instead of wrapping.
export function SectionHeader({ title, tabs }: { title: string; tabs: SectionTab[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        {tabs.map((tab) => (
          // NavLink passes isActive to className: true when the URL starts with `to`
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => tabClasses(tab.active ?? isActive)}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function tabClasses(active: boolean): string {
  return `-mb-px border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
    active
      ? 'border-brand-500 text-brand-600'
      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
  }`
}
