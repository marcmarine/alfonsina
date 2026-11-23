import { describe, expect, it } from 'vitest'
import { apparentSiderealTime, trueObliquity } from '../../core/earth/index.ts'
import { fromJulianDayUT, fromLocal } from '../../core/time/index.ts'
import { caelusEngine } from '../../engines/caelus/index.ts'
import type { JulianDayUT } from '../../engines/contract/index.ts'
import { angles } from '../houses/index.ts'
import { NoSunriseError } from './errors.ts'
import { findSunrise } from './sunrise.ts'

const engine = caelusEngine()
const state = engine.state.bind(engine)
const MADRID = { latitude: 40.4168, longitude: -3.7038 }
const RADIANS = Math.PI / 180

/** Distance in degrees between the Sun and the ascendant at an instant. */
function sunToAscendant(julianDay: JulianDayUT, latitude: number, longitude: number): number {
  const instant = fromJulianDayUT(julianDay)
  const sun = state('sun', instant.julianDayTT).longitude
  const { ascendant } = angles(
    apparentSiderealTime(instant, longitude),
    latitude,
    trueObliquity(instant.julianDayTT),
  )
  return Math.abs(((((sun - ascendant) % 360) + 540) % 360) - 180)
}

/** Sine of the altitude of the ecliptic point at the Sun's longitude, computed directly. */
function sunPointAltitude(julianDay: number, latitude: number, longitude: number): number {
  const instant = fromJulianDayUT(julianDay as JulianDayUT)
  const sun = state('sun', instant.julianDayTT).longitude * RADIANS
  const obliquity = trueObliquity(instant.julianDayTT) * RADIANS
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(sun))
  const rightAscension = Math.atan2(Math.sin(sun) * Math.cos(obliquity), Math.cos(sun))
  const hourAngle = apparentSiderealTime(instant, longitude) * RADIANS - rightAscension
  return (
    Math.sin(latitude * RADIANS) * Math.sin(declination) +
    Math.cos(latitude * RADIANS) * Math.cos(declination) * Math.cos(hourAngle)
  )
}

/** Risings of the Sun's ecliptic point found minute by minute, in minutes after midnight. */
function risingsByMinute(date: string, latitude: number, longitude: number, utcOffset: string) {
  const start = fromLocal({ date, time: '00:00', utcOffset }).instant.julianDayUT
  const altitude = (minute: number) => sunPointAltitude(start + minute / 1440, latitude, longitude)
  const minutes: number[] = []
  let previous = altitude(0)
  for (let minute = 1; minute <= 1440; minute += 1) {
    const value = altitude(minute)
    if (previous < 0 && value >= 0) minutes.push(minute)
    previous = value
  }
  return { start, minutes }
}

/** Whether the exact rising falls within half a second of an instant: below, then above. */
function isNearestSecond(julianDay: number, latitude: number, longitude: number): boolean {
  const halfSecond = 0.5 / 86_400
  return (
    sunPointAltitude(julianDay - halfSecond, latitude, longitude) < 0 &&
    sunPointAltitude(julianDay + halfSecond, latitude, longitude) >= 0
  )
}

describe('findSunrise', () => {
  it('finds the instant the Sun is on the ascendant, to the whole second', () => {
    const { instant, warnings } = findSunrise(state, '1990-05-15', MADRID, {
      timezone: 'Europe/Madrid',
    })
    expect(instant.local).toBe('1990-05-15T07:03:41+02:00')
    expect(instant.utc).toBe('1990-05-15T05:03:41Z')
    expect(sunToAscendant(instant.julianDayUT, MADRID.latitude, MADRID.longitude)).toBeLessThan(
      0.01,
    )
    expect(warnings.map((warning) => warning.code)).toEqual(['SUNRISE_CHART'])
    expect(warnings[0]?.message).toContain(instant.local)
  })

  it('agrees with a minute-by-minute search', () => {
    for (const [date, latitude, longitude] of [
      ['1990-01-15', -33.9, 18.4],
      ['1990-03-21', 0, 0],
      ['1990-06-21', 60.17, 24.94],
      ['1990-09-01', 51.5, -0.13],
      ['1990-12-21', -54.8, -68.3],
    ] as const) {
      const { start, minutes } = risingsByMinute(date, latitude, longitude, '+00:00')
      const { instant } = findSunrise(state, date, { latitude, longitude }, { utcOffset: '+00:00' })
      const found = (instant.julianDayUT - start) * 1440
      expect(minutes, date).toHaveLength(1)
      expect(Math.abs(found - (minutes[0] as number)), date).toBeLessThan(1)
    }
  })

  it('rounds to the second nearest the exact crossing', () => {
    for (const [date, latitude, longitude] of [
      ['1990-05-15', MADRID.latitude, MADRID.longitude],
      ['1990-01-15', -33.9, 18.4],
      ['1990-06-21', 60.17, 24.94],
      ['1990-12-21', -54.8, -68.3],
      ['2024-02-29', 35.68, 139.69],
    ] as const) {
      const { instant } = findSunrise(state, date, { latitude, longitude }, { utcOffset: '+00:00' })
      expect(isNearestSecond(instant.julianDayUT, latitude, longitude), date).toBe(true)
    }
  })

  it('asks the engine for the Sun only a few times', () => {
    let calls = 0
    const counted: typeof state = (body, julianDay) => {
      calls += 1
      return state(body, julianDay)
    }
    findSunrise(counted, '1990-05-15', MADRID, { timezone: 'Europe/Madrid' })
    expect(calls).toBeLessThanOrEqual(6)
  })

  it('reads the day in the time zone, on days of 23 and 25 hours', () => {
    const spring = findSunrise(state, '2021-03-28', MADRID, { timezone: 'Europe/Madrid' })
    const autumn = findSunrise(state, '2021-10-31', MADRID, { timezone: 'Europe/Madrid' })
    expect(spring.instant.local).toMatch(/^2021-03-28T08:\d\d:\d\d\+02:00$/)
    expect(autumn.instant.local).toMatch(/^2021-10-31T07:\d\d:\d\d\+01:00$/)
  })

  it('finds a sunrise minutes after a sunset, where the Sun barely dips below the horizon', () => {
    // At 66.5° N on the June solstice the Sun's centre is below the horizon for about half
    // an hour around 01:20 local time.
    const location = { latitude: 66.5, longitude: 25.7 }
    const { instant } = findSunrise(state, '1990-06-21', location, { utcOffset: '+03:00' })
    expect(instant.local).toMatch(/^1990-06-21T01:3\d:\d\d\+03:00$/)
    expect(isNearestSecond(instant.julianDayUT, location.latitude, location.longitude)).toBe(true)
  })

  it('finds a dip below the horizon shorter than the spacing of its samples', () => {
    // A little further north the dip lasts about two and a half minutes.
    const location = { latitude: 66.5595, longitude: 25.7 }
    const { instant } = findSunrise(state, '1990-06-21', location, { utcOffset: '+03:00' })
    expect(instant.local).toMatch(/^1990-06-21T01:\d\d:\d\d\+03:00$/)
    expect(isNearestSecond(instant.julianDayUT, location.latitude, location.longitude)).toBe(true)
  })

  it('uses the first of two sunrises on the same day, with a warning', () => {
    // A clock far from solar time puts one sunrise just after midnight and the next
    // just before the following midnight.
    const location = { latitude: 63, longitude: 52.5 }
    const { minutes } = risingsByMinute('1990-05-31', 63, 52.5, '+01:00')
    expect(minutes).toHaveLength(2)
    const { instant, warnings } = findSunrise(state, '1990-05-31', location, {
      utcOffset: '+01:00',
    })
    expect(instant.local).toMatch(/^1990-05-31T00:0\d:\d\d\+01:00$/)
    expect(warnings.map((warning) => warning.code)).toEqual(['SUNRISE_CHART', 'MULTIPLE_SUNRISES'])
    expect(warnings[1]?.message).toContain('2 times')
  })

  it.each([
    ['polar day', '1990-06-21'],
    ['polar night', '1990-12-21'],
  ])('throws NoSunriseError in the %s', (_, date) => {
    const location = { latitude: 69.65, longitude: 18.96 }
    let error: unknown
    try {
      findSunrise(state, date, location, { timezone: 'Europe/Oslo' })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(NoSunriseError)
    expect(error).toMatchObject({ name: 'NoSunriseError', code: 'NO_SUNRISE', date, location })
    expect((error as NoSunriseError).suggestion).toContain('birth time')
  })
})
