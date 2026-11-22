import { describe, expect, it } from 'vitest'
import type { JulianDayUT } from '../../engines/contract/index.ts'
import { decimalYearFromJulianDay, julianDayFromUTC } from './calendar.ts'
import { DELTA_T_MODEL, deltaT, espenakMeeus, isDeltaTExtrapolated } from './delta-t.ts'

function at(utc: string): JulianDayUT {
  return julianDayFromUTC(utc) as JulianDayUT
}

describe('deltaT', () => {
  it.each([
    // USNO measured values on January 1
    ['1900-01-01', -2.7, 0.01],
    ['1973-01-01', 43.373, 0.001],
    ['2000-01-01', 63.8285, 0.001],
    ['2026-01-01', 69.1099, 0.001],
    // Between measured values; naelos-ephemeris gives 57.13 s
    ['1990-05-15T12:30:00Z', 57.13, 0.05],
  ])('at %s is %d s', (utc, seconds, tolerance) => {
    expect(Math.abs(deltaT(at(utc)) - seconds)).toBeLessThan(tolerance)
  })

  it('uses the plain polynomials more than a century away from the measured values', () => {
    for (const utc of ['-000500-01-01', '1000-01-01', '2200-01-01']) {
      const julianDay = at(utc)
      expect(deltaT(julianDay)).toBeCloseTo(espenakMeeus(decimalYearFromJulianDay(julianDay)), 9)
    }
  })

  it('stays continuous where the measured values meet the polynomials', () => {
    const second = 1 / 86_400
    for (const utc of [DELTA_T_MODEL.measured.start, DELTA_T_MODEL.measured.end]) {
      const edge = at(utc)
      const before = deltaT((edge - second) as JulianDayUT)
      const after = deltaT((edge + second) as JulianDayUT)
      expect(Math.abs(after - before)).toBeLessThan(0.001)
    }
  })

  it('keeps growing after the measured values', () => {
    expect(deltaT(at('2030-01-01'))).toBeGreaterThan(deltaT(at('2026-10-01')))
    expect(deltaT(at('2100-01-01'))).toBeGreaterThan(deltaT(at('2030-01-01')))
  })
})

describe('espenakMeeus', () => {
  it.each([
    // Where the −500…500 polynomial meets the long-term parabola
    [-500, 17203.7, 0.1],
    [1000, 1574.2, 0.1],
    [1990.37, 57.137, 0.001],
    [2000, 63.86, 0.001],
    [2200, 442.08, 0.01],
  ])('in %d is about %d s', (year, seconds, tolerance) => {
    expect(Math.abs(espenakMeeus(year) - seconds)).toBeLessThan(tolerance)
  })
})

describe('isDeltaTExtrapolated', () => {
  it('is false within the measured values, ends included', () => {
    expect(isDeltaTExtrapolated(at(DELTA_T_MODEL.measured.start))).toBe(false)
    expect(isDeltaTExtrapolated(at('1990-05-15'))).toBe(false)
    expect(isDeltaTExtrapolated(at(DELTA_T_MODEL.measured.end))).toBe(false)
  })

  it('is true before and after them', () => {
    expect(isDeltaTExtrapolated(at('1656-12-31'))).toBe(true)
    expect(isDeltaTExtrapolated(at('2026-10-02'))).toBe(true)
    expect(isDeltaTExtrapolated(at('2100-01-01'))).toBe(true)
  })
})
