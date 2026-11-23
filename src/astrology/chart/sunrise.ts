import { earthRotationAngle } from '../../core/earth/earth.ts'
import { apparentSiderealTime, trueObliquity } from '../../core/earth/index.ts'
import { julianDayFromUTC, utcFromJulianDay } from '../../core/time/calendar.ts'
import { fromJulianDayUT, fromLocal, type LocalInstant } from '../../core/time/index.ts'
import { type TimeZoneRule, toLocal } from '../../core/time/time-zone.ts'
import type { Warning } from '../../core/warning.ts'
import type { JulianDayUT } from '../../engines/contract/index.ts'
import type { Coordinates, StateFunction } from './chart.ts'
import { NoSunriseError } from './errors.ts'

const SECOND = 1 / 86_400
const MILLISECOND = SECOND / 1000
const MINUTE = 60 * SECOND
/** Spacing of the samples that look for risings and near-horizon turns. */
const STEP = 10 * MINUTE
const UNIX_EPOCH_JULIAN_DAY = 2440587.5
const RADIANS_PER_DEGREE = Math.PI / 180

export interface Sunrise {
  /** The sunrise instant, rounded to the second, as a local time. */
  instant: LocalInstant
  /** `SUNRISE_CHART`, and `MULTIPLE_SUNRISES` when the Sun crosses the ascendant twice. */
  warnings: Warning[]
}

/** What the altitude of the Sun's ecliptic point depends on at an instant, in degrees. */
interface SunPoint {
  /** The Sun's apparent ecliptic longitude. */
  longitude: number
  /** True obliquity of the ecliptic. */
  obliquity: number
  /** Apparent sidereal time at the place. */
  siderealTime: number
}

/** The Sun's point at an instant, from the engine and the Earth orientation models. */
function sunPoint(state: StateFunction, julianDay: number, coordinates: Coordinates): SunPoint {
  const instant = fromJulianDayUT(julianDay as JulianDayUT)
  return {
    longitude: state('sun', instant.julianDayTT).longitude,
    obliquity: trueObliquity(instant.julianDayTT),
    siderealTime: apparentSiderealTime(instant, coordinates.longitude),
  }
}

/**
 * Sine of the altitude of the ecliptic point at the Sun's longitude. The Sun is on the
 * ascendant exactly when that point rises on the eastern horizon: this goes from negative
 * to positive. Unlike Sun minus ascendant, it never jumps, even where the ascendant does
 * inside the polar circles.
 */
function altitude(point: SunPoint, latitude: number): number {
  const longitude = point.longitude * RADIANS_PER_DEGREE
  const obliquity = point.obliquity * RADIANS_PER_DEGREE
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(longitude))
  const rightAscension = Math.atan2(Math.sin(longitude) * Math.cos(obliquity), Math.cos(longitude))
  const hourAngle = point.siderealTime * RADIANS_PER_DEGREE - rightAscension
  const phi = latitude * RADIANS_PER_DEGREE
  return (
    Math.sin(phi) * Math.sin(declination) +
    Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle)
  )
}

/** Signed difference to − from, in degrees, in (−180, 180]. */
function difference(to: number, from: number): number {
  const result = (((to - from) % 360) + 360) % 360
  return result > 180 ? result - 360 : result
}

/**
 * The Sun's point over a day, from three exact points: at the start, the middle and the end.
 * The Earth's rotation is exact; what is left (the Sun's longitude, the obliquity, and
 * sidereal time minus the rotation, which holds precession and nutation) changes slowly and
 * smoothly, and a parabola through the three points follows it to well under a
 * milliarcsecond over a day. Each value then costs a few sines instead of an engine call.
 */
function dayModel(
  state: StateFunction,
  start: number,
  end: number,
  coordinates: Coordinates,
): (julianDay: number) => SunPoint {
  const middle = (start + end) / 2
  const half = (end - start) / 2
  const points = [start, middle, end].map((julianDay) => {
    const point = sunPoint(state, julianDay, coordinates)
    const rotation = earthRotationAngle(julianDay as JulianDayUT)
    return { ...point, siderealTime: difference(point.siderealTime, rotation) }
  })
  const [first, center, last] = points as [SunPoint, SunPoint, SunPoint]
  /** A parabola through the three values, unwrapped around the middle one. */
  const parabola = (key: keyof SunPoint) => {
    const low = difference(first[key], center[key])
    const high = difference(last[key], center[key])
    const slope = (high - low) / 2
    const curvature = (high + low) / 2
    return (u: number) => center[key] + (slope + curvature * u) * u
  }
  const longitude = parabola('longitude')
  const obliquity = parabola('obliquity')
  const offset = parabola('siderealTime')
  return (julianDay) => {
    const u = (julianDay - middle) / half
    return {
      longitude: longitude(u),
      obliquity: obliquity(u),
      siderealTime: earthRotationAngle(julianDay as JulianDayUT) + offset(u),
    }
  }
}

/** Below this |sin altitude| (about 3°), a sampled turn is searched for a hidden crossing. */
const NEAR_HORIZON = 0.05
const GOLDEN = (Math.sqrt(5) - 1) / 2

/**
 * The instants of a local day when the Sun's point rises, in order. The day model is
 * sampled every ten minutes and each rise from negative to positive is bisected to a
 * millisecond. Where three samples show a turn near the horizon, a golden-section search
 * finds it, so a dip below the horizon (or a peak above it) shorter than the sampling,
 * which happens near the polar circles, is not missed.
 */
function risings(g: (julianDay: number) => number, start: number, end: number): number[] {
  /** The root of g between a negative and a positive value, to a millisecond. */
  function bisect(low: number, high: number): number {
    while (high - low > MILLISECOND) {
      const middle = (low + high) / 2
      if (g(middle) < 0) low = middle
      else high = middle
    }
    return (low + high) / 2
  }

  /** The instant of the extremum of g between two instants (a minimum when `minimum`). */
  function extremum(low: number, high: number, minimum: boolean): number {
    const sign = minimum ? 1 : -1
    let a = low
    let b = high
    let c = b - GOLDEN * (b - a)
    let d = a + GOLDEN * (b - a)
    let gc = sign * g(c)
    let gd = sign * g(d)
    while (b - a > MILLISECOND) {
      if (gc < gd) {
        b = d
        d = c
        gd = gc
        c = b - GOLDEN * (b - a)
        gc = sign * g(c)
      } else {
        a = c
        c = d
        gc = gd
        d = a + GOLDEN * (b - a)
        gd = sign * g(d)
      }
    }
    return (a + b) / 2
  }

  const count = Math.max(1, Math.round((end - start) / STEP))
  const times = Array.from({ length: count + 1 }, (_, index) =>
    index === count ? end : start + (index * (end - start)) / count,
  )
  const values = times.map(g)

  const roots: number[] = []
  for (let index = 0; index + 1 < times.length; index += 1) {
    if ((values[index] as number) < 0 && (values[index + 1] as number) >= 0) {
      roots.push(bisect(times[index] as number, times[index + 1] as number))
    }
  }

  for (let index = 1; index + 1 < times.length; index += 1) {
    const before = values[index - 1] as number
    const value = values[index] as number
    const after = values[index + 1] as number
    const isMinimum = value <= before && value <= after && value > 0
    const isMaximum = value >= before && value >= after && value < 0
    if (!(isMinimum || isMaximum) || Math.abs(value) > NEAR_HORIZON) continue
    const low = times[index - 1] as number
    const high = times[index + 1] as number
    const turn = extremum(low, high, isMinimum)
    const turnValue = g(turn)
    // A dip below the horizon rises after the turn; a peak above it rises before.
    if (isMinimum && turnValue < 0) roots.push(bisect(turn, high))
    if (isMaximum && turnValue >= 0) roots.push(bisect(low, turn))
  }
  return roots.sort((a, b) => a - b)
}

/**
 * Newton steps on the exact altitude from a rising found on the day model, with the
 * model's slope. The model is already within a fraction of a millisecond, so one exact
 * evaluation usually confirms it. Never leaves the day or moves more than a minute.
 */
function polish(
  exact: (julianDay: number) => number,
  model: (julianDay: number) => number,
  rising: number,
  start: number,
  end: number,
): number {
  let julianDay = rising
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const slope = (model(julianDay + SECOND) - model(julianDay - SECOND)) / (2 * SECOND)
    const step = exact(julianDay) / slope
    if (!(Math.abs(step) <= MINUTE)) break
    julianDay = Math.min(Math.max(julianDay - step, start), end)
    if (Math.abs(step) < MILLISECOND) break
  }
  return julianDay
}

/** The date after a `YYYY-MM-DD` date. */
function nextDate(date: string): string {
  return utcFromJulianDay(julianDayFromUTC(date) + 1).split('T')[0] as string
}

/** Rounds a Julian Day UT to the nearest whole second of UTC. */
function toWholeSecond(julianDay: number): JulianDayUT {
  const seconds = Math.round((julianDay - UNIX_EPOCH_JULIAN_DAY) * 86_400)
  return (seconds / 86_400 + UNIX_EPOCH_JULIAN_DAY) as JulianDayUT
}
/**
 * Sunrise on a local date at a place: the first instant the Sun's ecliptic longitude
 * equals the ascendant's, between local midnight and the next. It is the geometric rising
 * of the Sun's centre, without refraction or semidiameter, so a few minutes after the
 * sunrise of almanacs, which is the upper limb appearing through refraction.
 *
 * @throws {NoSunriseError} If the Sun does not cross the ascendant that day.
 */
export function findSunrise(
  state: StateFunction,
  date: string,
  coordinates: Coordinates,
  zone: TimeZoneRule,
): Sunrise {
  const midnight = (day: string) => fromLocal({ date: day, time: '00:00', ...zone }).instant
  const start = midnight(date).julianDayUT
  const end = midnight(nextDate(date)).julianDayUT
  const point = dayModel(state, start, end, coordinates)
  const model = (julianDay: number) => altitude(point(julianDay), coordinates.latitude)
  const exact = (julianDay: number) =>
    altitude(sunPoint(state, julianDay, coordinates), coordinates.latitude)
  const [first, ...others] = risings(model, start, end)
  if (first === undefined) throw new NoSunriseError(date, coordinates)

  const instant = toLocal(toWholeSecond(polish(exact, model, first, start, end)), zone)
  const warnings: Warning[] = [
    {
      code: 'SUNRISE_CHART',
      message:
        `No birth time was given: the chart is cast for sunrise, ${instant.local}. Its ` +
        "angles and houses are those of sunrise, not the person's, and the Moon may be off " +
        'by up to about 6.5°, enough to change its sign.',
    },
  ]
  if (others.length > 0) {
    warnings.push({
      code: 'MULTIPLE_SUNRISES',
      message:
        `The Sun crosses the ascendant ${others.length + 1} times on ${date} at this ` +
        `place; the first, ${instant.local}, was used.`,
    })
  }
  return { instant, warnings }
}
