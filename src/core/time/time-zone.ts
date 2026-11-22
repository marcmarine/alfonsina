import type { JulianDayUT } from '../../engines/contract/index.ts'
import type { Warning } from '../warning.ts'
import { julianDayFromUTC, utcFromJulianDay } from './calendar.ts'
import { InvalidDateError, InvalidTimeZoneError } from './errors.ts'
import { fromJulianDayUT } from './scales.ts'
import type { LocalInstant, LocalTime } from './types.ts'

/** Codes of the warnings that reading a local time can produce. */
export type TimeWarningCode = 'AMBIGUOUS_LOCAL_TIME' | 'NONEXISTENT_LOCAL_TIME'

export interface LocalTimeResult {
  instant: LocalInstant
  warnings: Warning[]
}

const UNIX_EPOCH_JULIAN_DAY = 2440587.5
const MILLISECONDS_PER_DAY = 86_400_000

const DATE = /^([+-]\d{6}|\d{4})-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/
const OFFSET = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/
const INTL_OFFSET = /^GMT(?:([+-])(\d{2}):(\d{2})(?::(\d{2}))?)?$/

/** Largest accepted offset, as in Temporal. Real offsets stay within −12h and +14h. */
const MAXIMUM_OFFSET_SECONDS = 18 * 3600

const OFFSET_SUGGESTION = "Write utcOffset as ±HH:mm, e.g. '+02:00', '-03:30' or '+00:00' for UTC."

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone)
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'longOffset',
      })
    } catch {
      throw new InvalidTimeZoneError(
        timezone,
        'not a time zone known to this runtime',
        "Use an IANA time zone such as 'Europe/Madrid', or give utcOffset instead.",
      )
    }
    formatters.set(timezone, formatter)
  }
  return formatter
}

function signedSeconds(sign: string, hours: string, minutes: string, seconds = '0'): number {
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  return sign === '-' ? -total : total
}

/** UTC offset in seconds of a time zone at an instant given in milliseconds since 1970. */
function offsetAt(formatter: Intl.DateTimeFormat, epochMilliseconds: number): number {
  const name = formatter
    .formatToParts(epochMilliseconds)
    .find((part) => part.type === 'timeZoneName')?.value
  const match = name === undefined ? null : INTL_OFFSET.exec(name)
  if (!match) throw new Error(`Unexpected time zone offset from Intl: '${name}'.`)
  const [, sign, hours, minutes, seconds] = match
  return sign === undefined ? 0 : signedSeconds(sign, hours as string, minutes as string, seconds)
}

function parseUtcOffset(utcOffset: string): number {
  const match = OFFSET.exec(utcOffset)
  if (!match) throw new InvalidTimeZoneError(utcOffset, 'not a UTC offset', OFFSET_SUGGESTION)
  const [, sign, hours, minutes, seconds] = match as unknown as [
    string,
    string,
    string,
    string,
    string?,
  ]
  const offset = signedSeconds(sign, hours, minutes, seconds)
  if (
    Number(minutes) > 59 ||
    Number(seconds ?? 0) > 59 ||
    Math.abs(offset) > MAXIMUM_OFFSET_SECONDS
  ) {
    throw new InvalidTimeZoneError(utcOffset, 'the UTC offset is out of range', OFFSET_SUGGESTION)
  }
  return offset
}

function formatOffset(offsetSeconds: number): string {
  const sign = offsetSeconds < 0 ? '-' : '+'
  const total = Math.abs(offsetSeconds)
  const hours = String(Math.floor(total / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const seconds = total % 60
  return `${sign}${hours}:${minutes}${seconds === 0 ? '' : `:${String(seconds).padStart(2, '0')}`}`
}

/** Milliseconds since 1970 of a date and time read as if they were UTC. */
function wallClockMilliseconds(date: string, time: string): number {
  const text = `${date}T${time}`
  if (!DATE.test(date) || !TIME.test(time)) {
    throw new InvalidDateError(
      text,
      'date must be YYYY-MM-DD and time HH:mm, HH:mm:ss or HH:mm:ss.fff',
      "Give date and time separately, e.g. date '1990-05-15' and time '14:30'.",
    )
  }
  return Math.round((julianDayFromUTC(text) - UNIX_EPOCH_JULIAN_DAY) * MILLISECONDS_PER_DAY)
}

function toLocalInstant(epochMilliseconds: number, offsetSeconds: number): LocalInstant {
  const julianDayUT = (epochMilliseconds / MILLISECONDS_PER_DAY +
    UNIX_EPOCH_JULIAN_DAY) as JulianDayUT
  const localJulianDay = julianDayUT + offsetSeconds / 86_400
  const local = utcFromJulianDay(localJulianDay).replace(/Z$/, formatOffset(offsetSeconds))
  return { ...fromJulianDayUT(julianDayUT), local }
}

/**
 * Reads a local civil time with a fixed UTC offset or an IANA time zone, resolved with
 * the runtime's `Intl` and its time zone history, including local mean time before
 * standard time.
 *
 * A time that occurs twice (clocks set back) takes its first occurrence; a time that does
 * not exist (clocks set forward) moves forward by the length of the gap. Both add a
 * warning. A fixed `utcOffset` wins over `timezone` and never warns.
 *
 * @throws {InvalidDateError} If the date or time is malformed or does not exist.
 * @throws {InvalidTimeZoneError} If the time zone or offset is unknown, malformed or missing.
 */
export function fromLocal(input: LocalTime): LocalTimeResult {
  const wallClock = wallClockMilliseconds(input.date, input.time)

  if (input.utcOffset !== undefined) {
    const offset = parseUtcOffset(input.utcOffset)
    return { instant: toLocalInstant(wallClock - offset * 1000, offset), warnings: [] }
  }
  if (input.timezone === undefined) {
    throw new InvalidTimeZoneError(
      '',
      'Neither a time zone nor a UTC offset was given',
      "Give timezone, e.g. 'Europe/Madrid', or utcOffset, e.g. '+02:00'.",
    )
  }

  const formatter = formatterFor(input.timezone)
  // Offsets a day before and after cover any single transition near the wall-clock time.
  const before = offsetAt(formatter, wallClock - MILLISECONDS_PER_DAY)
  const after = offsetAt(formatter, wallClock + MILLISECONDS_PER_DAY)
  const readings = [...new Set([before, after])]
    .map((offset) => ({ offset, epoch: wallClock - offset * 1000 }))
    .filter((reading) => offsetAt(formatter, reading.epoch) === reading.offset)
    .sort((a, b) => a.epoch - b.epoch)

  const asked = `${input.date}T${input.time}`
  const [first] = readings
  if (first === undefined) {
    // Nonexistent: read with the offset in force before the gap, which lands after it.
    const epoch = wallClock - before * 1000
    const instant = toLocalInstant(epoch, offsetAt(formatter, epoch))
    return {
      instant,
      warnings: [
        {
          code: 'NONEXISTENT_LOCAL_TIME',
          message:
            `Local time ${asked} does not exist in ${input.timezone} (clocks were set forward); ` +
            `it was read as ${instant.local}. Give utcOffset to choose another reading.`,
        },
      ],
    }
  }

  const instant = toLocalInstant(first.epoch, first.offset)
  if (readings.length === 1) return { instant, warnings: [] }
  return {
    instant,
    warnings: [
      {
        code: 'AMBIGUOUS_LOCAL_TIME',
        message:
          `Local time ${asked} occurs twice in ${input.timezone} (clocks were set back); ` +
          `the first one, ${instant.local}, was used. Give utcOffset to choose the other.`,
      },
    ],
  }
}
