import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { errorMessage } from '../api/errors'
import { useMe } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Card } from '../components/Card'
import { StatTile } from '../components/StatTile'
import { AXIS_COLOR, GRID_COLOR, MUTED_TEXT, SERIES_COLOR } from '../lib/chartTheme'
import { useFormatters } from '../i18n/format'
import { type HistoryEntry, useExerciseHistory } from './hooks'

/**
 * Progress of one exercise for the logged-in user: headline numbers, a chart of the heaviest set per
 * training (or total reps for bodyweight exercises) and every training as a table. Loaded with
 * React.lazy from the exercise page, so Recharts is downloaded only when this is shown.
 */
export default function ExerciseProgress({ exerciseId }: { exerciseId: number }) {
  const { t } = useTranslation()
  const { formatWeight, formatShortDate } = useFormatters()
  const { data: me } = useMe()
  const history = useExerciseHistory(exerciseId, me?.id)

  if (history.isPending) return null
  if (history.isError) return <Alert tone="error">{errorMessage(history.error, t)}</Alert>
  const entries = history.data
  if (entries.length === 0) {
    return (
      <Card title={t('fitness.progress.title')}>
        <p className="text-sm text-slate-600">{t('fitness.progress.empty')}</p>
      </Card>
    )
  }

  // With a weight anywhere, progress is the heaviest set; a bodyweight exercise counts reps.
  const byWeight = entries.some((entry) => entry.max_weight !== null)
  const value = (entry: HistoryEntry) =>
    byWeight ? Number(entry.max_weight ?? 0) : entry.total_reps
  const best = entries.reduce((top, entry) => (value(entry) > value(top) ? entry : top))
  const last = entries.at(-1)!

  return (
    <Card title={t('fitness.progress.title')}>
      <dl className="mb-4 grid grid-cols-3 gap-3">
        <StatTile
          label={t(byWeight ? 'fitness.progress.bestWeight' : 'fitness.progress.bestReps')}
          value={byWeight ? formatWeight(best.max_weight) : String(best.total_reps)}
        />
        <StatTile label={t('fitness.progress.lastTime')} value={formatShortDate(last.date)} />
        <StatTile label={t('fitness.progress.trainings')} value={String(entries.length)} />
      </dl>

      {entries.length > 1 && (
        <>
          <p className="mb-2 text-xs text-slate-500">
            {t(byWeight ? 'fitness.progress.chartWeight' : 'fitness.progress.chartReps')}
          </p>
          <ProgressChart entries={entries} byWeight={byWeight} />
        </>
      )}

      <HistoryTable entries={entries} />
    </Card>
  )
}

function ProgressChart({ entries, byWeight }: { entries: HistoryEntry[]; byWeight: boolean }) {
  const { formatWeight, formatShortDate, formatNumber } = useFormatters()
  const data = entries.map((entry) => ({
    date: entry.date,
    value: byWeight ? Number(entry.max_weight ?? 0) : entry.total_reps,
  }))

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis
            dataKey="date"
            tickFormatter={(date: string) => formatShortDate(date)}
            tick={{ fill: MUTED_TEXT, fontSize: 12 }}
            axisLine={{ stroke: AXIS_COLOR }}
            tickLine={false}
            minTickGap={32}
          />
          <YAxis
            tickFormatter={(value: number) => formatNumber(value)}
            tick={{ fill: MUTED_TEXT, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={48}
            domain={['auto', 'auto']} // weights change in small steps: don't start the axis at 0
          />
          <Tooltip
            cursor={{ stroke: AXIS_COLOR }}
            content={({ active, payload }) => {
              const point = active ? payload?.[0]?.payload : undefined
              if (!point) return null
              return (
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
                  <p className="font-medium">{formatShortDate(point.date)}</p>
                  <p>{byWeight ? formatWeight(point.value) : point.value}</p>
                </div>
              )
            }}
          />
          {/* One point per training: markers show where the measurements are. */}
          <Line
            type="linear"
            dataKey="value"
            stroke={SERIES_COLOR}
            strokeWidth={2}
            dot={{ r: 4, fill: SERIES_COLOR, stroke: '#ffffff', strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Every training with this exercise, newest first: the chart's numbers plus each set.
function HistoryTable({ entries }: { entries: HistoryEntry[] }) {
  const { t } = useTranslation()
  const { formatWeight, formatShortDate, formatNumber } = useFormatters()

  return (
    <details className="mt-3 text-sm" open={entries.length === 1}>
      <summary className="cursor-pointer text-slate-600">{t('fitness.progress.showAll')}</summary>
      <ul className="mt-2 flex max-h-80 flex-col divide-y divide-slate-100 overflow-y-auto">
        {[...entries].reverse().map((entry) => (
          <li key={entry.training_id} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0">
              <Link
                to={`/fitness/trainings/${entry.training_id}`}
                className="font-medium hover:underline"
              >
                {formatShortDate(entry.date)}
              </Link>
              <span className="block text-xs text-slate-500">
                {entry.sets
                  .map((set) =>
                    set.weight === null
                      ? `${set.reps}`
                      : `${formatWeight(set.weight)} × ${set.reps}`,
                  )
                  .join(', ')}
              </span>
            </span>
            {entry.volume > 0 && (
              <span className="shrink-0 text-xs text-slate-600 tabular-nums">
                {formatNumber(entry.volume)} kg
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
