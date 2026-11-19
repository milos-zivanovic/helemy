// A "segmented control": a few options side by side in a grey track, the chosen one raised in white
// (expense / income / transfer, list / chart). Classes only, because the options are radio inputs in
// one place and buttons in another.
export const segmentedTrack = 'flex rounded-xl bg-slate-100 p-1'

export function segmentedOption(active: boolean, extra = ''): string {
  return `rounded-lg px-3 py-1.5 text-center text-sm font-medium transition-colors ${
    active ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
  } ${extra}`
}

// A toggle chip (several can be on, e.g. a training's muscle groups): on = brand colour.
export const chipClasses =
  'flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700 transition-colors hover:border-brand-300 has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:text-brand-700'
