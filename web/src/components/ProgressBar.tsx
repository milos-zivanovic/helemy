import { progressTone } from './progressTone'

// How much of a limit is used, coloured by progressTone; the bar itself stops at 100 % while the
// label shows the real percentage (e.g. 135 %).
export function ProgressBar({ percentage, label }: { percentage: number; label: string }) {
  const width = Math.min(Math.max(percentage, 0), 100)

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(percentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
    >
      {/* A width that depends on data can't be a fixed Tailwind class, so it's an inline style. */}
      <div
        className={`h-full rounded-full ${progressTone(percentage).bar}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
