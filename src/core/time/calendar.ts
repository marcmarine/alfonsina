import { InvalidDateError } from './errors.ts'

// Proleptic Gregorian calendar, as in ISO 8601, for every year (year 0 is 1 BC). UTC is
// read as UT: they differ by less than 0.9 s. No `Date` objects: `Date.UTC` maps years
// 0–99 to 1900–1999, and results must stay plain data.

/** Julian Day of 1970-01-01T00:00. */
const UNIX_EPOCH_JULIAN_DAY = 2440587.5

const MILLISECONDS_PER_DAY = 86_400_000

/** Days from 1970-01-01 to a civil date, for any year (H. Hinnant, `days_from_civil`). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yearOfEra = y - era * 400
  const dayOfYear = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146_097 + dayOfEra - 719_468
}

/** Civil date of a day count from 1970-01-01 (H. Hinnant, `civil_from_days`). */
function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719_468
  const era = Math.floor(z / 146_097)
  const dayOfEra = z - era * 146_097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  )
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0)
  return { year, month, day }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/**
 * Decimal year of a Julian Day in the proleptic Gregorian calendar: the year plus the
 * fraction of it elapsed, so January 1 at 0h is a whole number.
 */
export function decimalYearFromJulianDay(julianDay: number): number {
  const daysSinceEpoch = julianDay - UNIX_EPOCH_JULIAN_DAY
  const { year } = civilFromDays(Math.floor(daysSinceEpoch))
  const start = daysFromCivil(year, 1, 1)
  const length = daysFromCivil(year + 1, 1, 1) - start
  return year + (daysSinceEpoch - start) / length
}

const ISO_UTC =
  /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?Z?)?$/

const FORMAT_SUGGESTION =
  "Use an ISO 8601 date or date-time in UTC, e.g. '1990-05-15' or '1990-05-15T12:30:00Z'."

/**
 * Julian Day of an ISO 8601 date (`YYYY-MM-DD`) or date-time in UTC
 * (`YYYY-MM-DDTHH:mm[:ss[.fff]][Z]`). Years outside 0000–9999 use the expanded form
 * (`-004713`, `+010000`). Offsets other than `Z` are rejected: time zones are resolved
 * elsewhere.
 */
export function julianDayFromUTC(utc: string): number {
  const match = ISO_UTC.exec(utc)
  if (!match) {
    throw new InvalidDateError(utc, 'not an ISO 8601 date or date-time in UTC', FORMAT_SUGGESTION)
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText ?? 0)
  const minute = Number(minuteText ?? 0)
  const second = Number(secondText ?? 0) + Number(`0.${fractionText ?? 0}`)

  if (month < 1 || month > 12) {
    throw new InvalidDateError(utc, `month ${month} does not exist`, FORMAT_SUGGESTION)
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new InvalidDateError(
      utc,
      `day ${day} does not exist in that month`,
      'Check the day of the month; dates are proleptic Gregorian.',
    )
  }
  if (hour > 23 || minute > 59 || second >= 60) {
    throw new InvalidDateError(
      utc,
      'the time of day is out of range',
      'Use 00:00 to 23:59:59.999. Leap seconds (:60) are not accepted, since UTC is read as UT.',
    )
  }

  const days = daysFromCivil(year, month, day)
  return UNIX_EPOCH_JULIAN_DAY + days + (hour * 3600 + minute * 60 + second) / 86_400
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

function formatYear(year: number): string {
  if (year >= 0 && year <= 9999) return pad(year, 4)
  return (year < 0 ? '-' : '+') + pad(Math.abs(year), 6)
}

/**
 * ISO 8601 date-time in UTC of a Julian Day, rounded to the millisecond. Milliseconds are
 * written only when they are not zero: `'1990-05-15T12:30:00Z'`, `'1990-05-15T12:30:00.250Z'`.
 */
export function utcFromJulianDay(julianDay: number): string {
  const milliseconds = Math.round((julianDay - UNIX_EPOCH_JULIAN_DAY) * MILLISECONDS_PER_DAY)
  const days = Math.floor(milliseconds / MILLISECONDS_PER_DAY)
  let rest = milliseconds - days * MILLISECONDS_PER_DAY

  const hour = Math.floor(rest / 3_600_000)
  rest -= hour * 3_600_000
  const minute = Math.floor(rest / 60_000)
  rest -= minute * 60_000
  const second = Math.floor(rest / 1000)
  const millisecond = rest - second * 1000

  const { year, month, day } = civilFromDays(days)
  const date = `${formatYear(year)}-${pad(month, 2)}-${pad(day, 2)}`
  const time = `${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}`
  return `${date}T${time}${millisecond === 0 ? '' : `.${pad(millisecond, 3)}`}Z`
}
