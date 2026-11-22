// Builds `src/core/time/delta-t-data.ts` from USNO data. Pure functions, no I/O, so they
// can be tested without the network; `update-delta-t.ts` does the downloading and writing.

export const HISTORIC_URL = 'https://maia.usno.navy.mil/ser7/historic_deltat.data'
export const MONTHLY_URL = 'https://maia.usno.navy.mil/ser7/deltat.data'

/** First year of the generated table. */
export const FIRST_YEAR = 1657

/** Last year taken from the historic file; later years come from the monthly file. */
const LAST_HISTORIC_YEAR = 1973

export interface MonthlyValue {
  year: number
  month: number
  day: number
  /** ΔT in seconds, as written in the file. */
  seconds: string
}

export interface DeltaTData {
  firstYear: number
  /** ΔT in seconds on January 1 of each year from `firstYear`, as written in the files. */
  yearly: string[]
  latest: { date: string; seconds: string }
}

const NUMBER = /^-?\d+(\.\d+)?$/

/** Values on January 1 (`YYYY.000`) of the historic file, keyed by year. */
export function parseHistoric(text: string): Map<number, string> {
  const values = new Map<number, string>()
  for (const line of text.split('\n')) {
    const match = /^\s*(\d{4})\.000\s+(-?[\d.]+)/.exec(line)
    if (match) values.set(Number(match[1]), match[2] as string)
  }
  return values
}

/** Every row (`YYYY MM DD seconds`) of the monthly file, in file order. */
export function parseMonthly(text: string): MonthlyValue[] {
  const values: MonthlyValue[] = []
  for (const line of text.split('\n')) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 4 || !fields.every((field) => NUMBER.test(field))) continue
    const [year, month, day, seconds] = fields as [string, string, string, string]
    values.push({ year: Number(year), month: Number(month), day: Number(day), seconds })
  }
  return values
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Yearly values from the historic file up to 1973 and from the monthly file after it, plus
 * the latest monthly value.
 *
 * @throws {Error} If a year is missing or the files do not look like USNO data.
 */
export function buildDeltaTData(historicText: string, monthlyText: string): DeltaTData {
  const historic = parseHistoric(historicText)
  const monthly = parseMonthly(monthlyText)
  const latest = monthly.at(-1)
  if (!latest) throw new Error('The monthly ΔT file has no values.')

  const januaries = new Map(
    monthly.filter((value) => value.month === 1 && value.day === 1).map((v) => [v.year, v.seconds]),
  )

  const yearly: string[] = []
  for (let year = FIRST_YEAR; year <= latest.year; year++) {
    const value = year <= LAST_HISTORIC_YEAR ? historic.get(year) : januaries.get(year)
    if (value === undefined) {
      throw new Error(`No ΔT value for January 1, ${year}.`)
    }
    yearly.push(value)
  }

  return {
    firstYear: FIRST_YEAR,
    yearly,
    latest: {
      date: `${latest.year}-${pad(latest.month)}-${pad(latest.day)}`,
      seconds: latest.seconds,
    },
  }
}

/** Source of `src/core/time/delta-t-data.ts`. `bun run update-delta-t` formats it with Biome. */
export function renderDeltaTData(data: DeltaTData, generatedOn: string): string {
  const lastYear = data.firstYear + data.yearly.length - 1
  const rows: string[] = []
  for (let index = 0; index < data.yearly.length; index += 10) {
    rows.push(`  ${data.yearly.slice(index, index + 10).join(', ')},`)
  }

  return `// Generated from USNO data on ${generatedOn} by \`bun run update-delta-t\`. Do not edit by hand.
//
// Measured ΔT (TT − UT1) in seconds on January 1 of each year from ${data.firstYear} to ${lastYear}:
// - ${data.firstYear}–${LAST_HISTORIC_YEAR}: ${HISTORIC_URL}
// - ${LAST_HISTORIC_YEAR + 1}–${lastYear}: ${MONTHLY_URL}
// plus the latest monthly value, ${data.latest.date}.

/** Year of the first value in \`MEASURED_DELTA_T\`. */
export const MEASURED_FIRST_YEAR = ${data.firstYear}

/** ΔT in seconds on January 1 of each year, starting at \`MEASURED_FIRST_YEAR\`. */
export const MEASURED_DELTA_T: readonly number[] = [
${rows.join('\n')}
]

/** Latest measured value: its date (0h UT) and ΔT in seconds. */
export const LATEST_MEASURED_DELTA_T = { date: '${data.latest.date}', seconds: ${data.latest.seconds} } as const
`
}
