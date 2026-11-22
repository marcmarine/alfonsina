import { describe, expect, it } from 'vitest'
import type { JulianDayTT, JulianDayUT } from '../../engines/contract/index.ts'
import { fromUTC } from '../time/scales.ts'
import type { Instant } from '../time/types.ts'
import {
  apparentSiderealTime,
  earthRotationAngle,
  meanObliquity,
  meanSiderealTime,
  nutation,
  trueObliquity,
} from './earth.ts'
import { NUTATION_TERMS } from './nutation-terms.ts'

const RADIANS_PER_DEGREE = Math.PI / 180
const ARCSECOND = 1 / 3600

/** An instant from Julian Days alone, as ERFA's tests give them. */
function instantAt(julianDayUT: number, julianDayTT: number): Instant {
  return {
    utc: '',
    julianDayUT: julianDayUT as JulianDayUT,
    julianDayTT: julianDayTT as JulianDayTT,
  }
}

// Reference values from ERFA's test suite (t_erfa_c.c), in radians.
describe('against ERFA', () => {
  it('nutation matches eraNut00b', () => {
    const { longitude, obliquity } = nutation(2453736.5 as JulianDayTT)
    expect(longitude * RADIANS_PER_DEGREE).toBeCloseTo(-0.9632552291148363e-5, 12)
    expect(obliquity * RADIANS_PER_DEGREE).toBeCloseTo(0.4063197106621159e-4, 12)
  })

  it('mean obliquity matches eraObl06', () => {
    const obliquity = meanObliquity(2454388.5 as JulianDayTT)
    expect(obliquity * RADIANS_PER_DEGREE).toBeCloseTo(0.4090749229387258, 13)
  })

  it('Earth rotation angle matches eraEra00', () => {
    const angle = earthRotationAngle(2454388.5 as JulianDayUT)
    expect(angle * RADIANS_PER_DEGREE).toBeCloseTo(0.4022837240028158, 9)
  })

  it('mean sidereal time matches eraGmst06', () => {
    const sidereal = meanSiderealTime(instantAt(2453736.5, 2453736.5))
    expect(sidereal * RADIANS_PER_DEGREE).toBeCloseTo(1.754174971870091, 9)
  })

  it('apparent sidereal time matches eraGst06a within the 2000B truncation', () => {
    // eraGst06a uses the full IAU 2000A nutation; 2000B stays within a few mas.
    const sidereal = apparentSiderealTime(instantAt(2453736.5, 2453736.5))
    const difference = Math.abs(sidereal * RADIANS_PER_DEGREE - 1.754166137675019)
    expect(difference).toBeLessThan(2e-8) // about 4 mas
  })
})

// Meeus, Astronomical Algorithms (2nd ed.), examples 12.a and 22.a: 1987-04-10, 0h.
// Meeus uses the IAU 1980 models, which differ from the current ones by a few
// hundredths of an arcsecond.
describe('against Meeus', () => {
  const instant = fromUTC('1987-04-10')

  it('nutation (example 22.a)', () => {
    const { longitude, obliquity } = nutation(instant.julianDayTT)
    expect(Math.abs(longitude - -3.788 * ARCSECOND)).toBeLessThan(0.05 * ARCSECOND)
    expect(Math.abs(obliquity - 9.443 * ARCSECOND)).toBeLessThan(0.05 * ARCSECOND)
  })

  it('mean and true obliquity (example 22.a)', () => {
    const mean = 23 + 26 / 60 + 27.407 / 3600
    const real = 23 + 26 / 60 + 36.85 / 3600
    expect(Math.abs(meanObliquity(instant.julianDayTT) - mean)).toBeLessThan(0.06 * ARCSECOND)
    expect(Math.abs(trueObliquity(instant.julianDayTT) - real)).toBeLessThan(0.1 * ARCSECOND)
  })

  it('mean and apparent sidereal time at Greenwich (example 12.a)', () => {
    // Meeus uses the IAU 1982 sidereal time. IAU 2006 corrects the precession rate by
    // about −0.3″ per century, so in 1987 the two differ by about 0.05″ (3 ms of time).
    // The exact check is the one against ERFA above.
    const mean = (13 + 10 / 60 + 46.3668 / 3600) * 15
    const apparent = (13 + 10 / 60 + 46.1351 / 3600) * 15
    expect(Math.abs(meanSiderealTime(instant) - mean)).toBeLessThan(0.1 * ARCSECOND)
    expect(Math.abs(apparentSiderealTime(instant) - apparent)).toBeLessThan(0.1 * ARCSECOND)
  })
})

describe('sidereal time at a place', () => {
  const instant = fromUTC('1990-05-15T12:30:00Z')

  it('adds the geographic longitude, east positive', () => {
    const greenwich = meanSiderealTime(instant)
    expect(meanSiderealTime(instant, 15)).toBeCloseTo((greenwich + 15) % 360, 9)
    expect(apparentSiderealTime(instant, -3.7038)).toBeCloseTo(
      (apparentSiderealTime(instant) - 3.7038 + 360) % 360,
      9,
    )
  })

  it('stays within [0, 360)', () => {
    for (const longitude of [-180, -90, 0, 90, 179.9]) {
      for (const hour of [0, 6, 12, 18]) {
        const at = fromUTC(`2024-06-21T${String(hour).padStart(2, '0')}:00:00Z`)
        for (const value of [
          meanSiderealTime(at, longitude),
          apparentSiderealTime(at, longitude),
        ]) {
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThan(360)
        }
      }
    }
  })

  it('advances about 360.9856° per day', () => {
    const today = fromUTC('2000-01-01T00:00:00Z')
    const tomorrow = fromUTC('2000-01-02T00:00:00Z')
    const advance = (meanSiderealTime(tomorrow) - meanSiderealTime(today) + 360) % 360
    expect(advance).toBeCloseTo(0.9856, 3)
  })
})

describe('nutation', () => {
  it('uses the 77 luni-solar terms of IAU 2000B', () => {
    expect(NUTATION_TERMS).toHaveLength(77)
  })

  it('stays within its physical range over a full 18.6-year cycle', () => {
    let largestLongitude = 0
    let largestObliquity = 0
    for (let day = 0; day < 18.6 * 365.25; day += 5) {
      const { longitude, obliquity } = nutation((2451545 + day) as JulianDayTT)
      largestLongitude = Math.max(largestLongitude, Math.abs(longitude))
      largestObliquity = Math.max(largestObliquity, Math.abs(obliquity))
    }
    expect(largestLongitude / ARCSECOND).toBeGreaterThan(17)
    expect(largestLongitude / ARCSECOND).toBeLessThan(20)
    expect(largestObliquity / ARCSECOND).toBeGreaterThan(9)
    expect(largestObliquity / ARCSECOND).toBeLessThan(11)
  })
})

it('mean obliquity decreases about 47″ per century', () => {
  const now = meanObliquity(2451545 as JulianDayTT)
  const later = meanObliquity((2451545 + 36525) as JulianDayTT)
  expect((now - later) / ARCSECOND).toBeCloseTo(46.84, 1)
})
