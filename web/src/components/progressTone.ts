// The colour of how much of a limit (a budget) is used: green under 80 %, yellow from 80 % up to
// 100 % (exactly used up is still yellow), red once it's over. `bar` fills the ProgressBar, `text`
// colours the percentage next to it (darker shades, readable on white).
export function progressTone(percentage: number) {
  if (percentage > 100) return { bar: 'bg-red-500', text: 'text-red-700' }
  if (percentage >= 80) return { bar: 'bg-amber-400', text: 'text-amber-700' }
  return { bar: 'bg-green-500', text: 'text-green-700' }
}
