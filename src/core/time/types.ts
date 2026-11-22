import type { JulianDayTT, JulianDayUT } from '../../engines/contract/index.ts'

/** An instant, always in three forms. */
export interface Instant {
  /** ISO 8601 in UTC, e.g. `'1990-05-15T12:30:00Z'`. */
  utc: string
  julianDayUT: JulianDayUT
  julianDayTT: JulianDayTT
}

/**
 * A range of dates as users write it: ISO 8601 dates or date-times in UTC, both ends
 * included. Engines receive a `TimeRange` instead; `toTimeRange()` converts.
 */
export interface DateRange {
  start: string
  end: string
}
