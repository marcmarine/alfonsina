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

/** An instant read from a local civil time. */
export interface LocalInstant extends Instant {
  /**
   * The local time as interpreted, ISO 8601 with the UTC offset that was applied, e.g.
   * `'1990-05-15T14:30:00+02:00'`. Offsets before standard time keep their seconds
   * (`'1890-01-01T12:00:00-00:14:44'`).
   */
  local: string
}

/** A local civil time and the rule to read it. */
export interface LocalTime {
  /** ISO 8601 date, `YYYY-MM-DD`, proleptic Gregorian. */
  date: string
  /** `HH:mm`, `HH:mm:ss` or `HH:mm:ss.fff`. */
  time: string
  /** IANA time zone, e.g. `'Europe/Madrid'`. Ignored when `utcOffset` is given. */
  timezone?: string
  /** Fixed UTC offset, `±HH:mm` or `±HH:mm:ss`; `'+00:00'` for UTC. Wins over `timezone`. */
  utcOffset?: string
}
