// Chart colours shared by every chart (light surface). The data is the only loud thing: one series
// colour, and recessive chrome (hairline grid, muted axis text). Recharts takes colours as values,
// not Tailwind classes, so they are repeated here; they match the tokens in index.css.

/** The logo's blue (brand-500): 4.2:1 against the white card, above the 3:1 graphics need. */
export const SERIES_COLOR = '#5371ff'
export const GRID_COLOR = '#e2e8f0' // slate-200
export const AXIS_COLOR = '#cbd5e1' // slate-300
export const MUTED_TEXT = '#64748b' // slate-500
