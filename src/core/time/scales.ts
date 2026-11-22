import type { JulianDayTT, JulianDayUT, TimeRange } from '../../engines/contract/index.ts'
import { julianDayFromUTC, utcFromJulianDay } from './calendar.ts'
import { deltaT } from './delta-t.ts'
import { InvalidDateError } from './errors.ts'
import type { DateRange, Instant } from './types.ts'

const SECONDS_PER_DAY = 86_400

/**
 * Brands a number as a Julian Day in TT. For numbers computed by external code, such as a
 * search's `t + step`.
 *
 * @throws {RangeError} If the value is not a finite number.
 */
export function asJulianDayTT(value: number): JulianDayTT {
  if (!Number.isFinite(value)) throw new RangeError(`Julian Day TT must be finite, got ${value}.`)
  return value as JulianDayTT
}

/**
 * Brands a number as a Julian Day in UT.
 *
 * @throws {RangeError} If the value is not a finite number.
 */
export function asJulianDayUT(value: number): JulianDayUT {
  if (!Number.isFinite(value)) throw new RangeError(`Julian Day UT must be finite, got ${value}.`)
  return value as JulianDayUT
}

/** Julian Day TT of a Julian Day UT: adds ΔT. */
export function toJulianDayTT(julianDay: JulianDayUT): JulianDayTT {
  return (julianDay + deltaT(julianDay) / SECONDS_PER_DAY) as JulianDayTT
}

/** Julian Day UT of a Julian Day TT: subtracts ΔT, found by iteration since ΔT takes UT. */
export function toJulianDayUT(julianDay: JulianDayTT): JulianDayUT {
  let universal = julianDay - deltaT(julianDay as number as JulianDayUT) / SECONDS_PER_DAY
  for (let iteration = 0; iteration < 5; iteration++) {
    const next = julianDay - deltaT(universal as JulianDayUT) / SECONDS_PER_DAY
    if (Math.abs(next - universal) < 1e-12) {
      universal = next
      break
    }
    universal = next
  }
  return universal as JulianDayUT
}

/** The instant of a Julian Day UT. */
export function fromJulianDayUT(julianDay: JulianDayUT): Instant {
  return {
    utc: utcFromJulianDay(julianDay),
    julianDayUT: julianDay,
    julianDayTT: toJulianDayTT(julianDay),
  }
}

/** The instant of a Julian Day TT. */
export function fromJulianDayTT(julianDay: JulianDayTT): Instant {
  const julianDayUT = toJulianDayUT(julianDay)
  return { utc: utcFromJulianDay(julianDayUT), julianDayUT, julianDayTT: julianDay }
}

/**
 * The instant of an ISO 8601 date or date-time in UTC (`'1990-05-15'`,
 * `'1990-05-15T12:30:00Z'`). Dates are proleptic Gregorian; UTC is read as UT.
 *
 * @throws {InvalidDateError} If the text is not a valid date or date-time in UTC.
 */
export function fromUTC(utc: string): Instant {
  return fromJulianDayUT(julianDayFromUTC(utc) as JulianDayUT)
}

/**
 * The `TimeRange` an engine receives for a `DateRange` users write.
 *
 * @throws {InvalidDateError} If either end is invalid or the range ends before it starts.
 */
export function toTimeRange(range: DateRange): TimeRange {
  const start = fromUTC(range.start).julianDayTT
  const end = fromUTC(range.end).julianDayTT
  if (end < start) {
    throw new InvalidDateError(
      `${range.start}/${range.end}`,
      'the range ends before it starts',
      'Swap start and end.',
    )
  }
  return { start, end }
}
