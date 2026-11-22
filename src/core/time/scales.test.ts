import { describe, expect, it } from 'vitest'
import type { JulianDayTT, JulianDayUT } from '../../engines/contract/index.ts'
import { deltaT } from './delta-t.ts'
import { InvalidDateError } from './errors.ts'
import {
  asJulianDayTT,
  asJulianDayUT,
  fromJulianDayTT,
  fromJulianDayUT,
  fromUTC,
  toJulianDayTT,
  toJulianDayUT,
  toTimeRange,
} from './scales.ts'

describe('fromUTC', () => {
  it('returns the instant in UTC, UT and TT', () => {
    const instant = fromUTC('1990-05-15T12:30:00Z')
    expect(instant.utc).toBe('1990-05-15T12:30:00Z')
    expect(instant.julianDayUT).toBeCloseTo(2448027.0208333, 7)
    // A Julian Day near 2.4 million resolves about 40 µs, so compare to the millisecond.
    expect((instant.julianDayTT - instant.julianDayUT) * 86_400).toBeCloseTo(
      deltaT(instant.julianDayUT),
      3,
    )
  })

  it('writes a date as its midnight in full', () => {
    expect(fromUTC('1990-05-15').utc).toBe('1990-05-15T00:00:00Z')
  })

  it('returns plain data', () => {
    const instant = fromUTC('1990-05-15T12:30:00Z')
    expect(Object.getPrototypeOf(instant)).toBe(Object.prototype)
    expect(JSON.parse(JSON.stringify(instant))).toEqual(instant)
  })

  it('rejects invalid dates', () => {
    expect(() => fromUTC('1990-02-30')).toThrow(InvalidDateError)
  })
})

describe('UT and TT', () => {
  it('convert in both directions', () => {
    for (const utc of ['1700-06-01', '1990-05-15T12:30:00Z', '2026-10-01', '2150-01-01']) {
      const { julianDayUT } = fromUTC(utc)
      const julianDayTT = toJulianDayTT(julianDayUT)
      // Compared in seconds, to the resolution of a Julian Day (about 40 µs).
      expect((julianDayTT - julianDayUT) * 86_400).toBeCloseTo(deltaT(julianDayUT), 3)
      expect(Math.abs(toJulianDayUT(julianDayTT) - julianDayUT) * 86_400).toBeLessThan(1e-4)
    }
  })

  it('give the same instant from either Julian Day', () => {
    const instant = fromUTC('1990-05-15T12:30:00Z')
    expect(fromJulianDayUT(instant.julianDayUT)).toEqual(instant)
    const fromTT = fromJulianDayTT(instant.julianDayTT)
    expect(fromTT.utc).toBe(instant.utc)
    expect(fromTT.julianDayTT).toBe(instant.julianDayTT)
    expect(Math.abs(fromTT.julianDayUT - instant.julianDayUT) * 86_400).toBeLessThan(1e-4)
  })
})

describe('toTimeRange', () => {
  it('converts both ends to Julian Days TT', () => {
    const range = toTimeRange({ start: '1900-01-01', end: '2100-01-01' })
    expect(range.start).toBe(fromUTC('1900-01-01').julianDayTT)
    expect(range.end).toBe(fromUTC('2100-01-01').julianDayTT)
  })

  it('accepts a range of a single instant', () => {
    const range = toTimeRange({ start: '1990-05-15', end: '1990-05-15' })
    expect(range.start).toBe(range.end)
  })

  it('rejects a range that ends before it starts', () => {
    expect(() => toTimeRange({ start: '2100-01-01', end: '1900-01-01' })).toThrow(InvalidDateError)
  })

  it('rejects an invalid end', () => {
    expect(() => toTimeRange({ start: '1900-01-01', end: 'later' })).toThrow(InvalidDateError)
  })
})

describe('asJulianDayTT and asJulianDayUT', () => {
  it('brand finite numbers without changing them', () => {
    const tt: JulianDayTT = asJulianDayTT(2451545.25)
    const ut: JulianDayUT = asJulianDayUT(2451545.25)
    expect(tt).toBe(2451545.25)
    expect(ut).toBe(2451545.25)
  })

  it('reject values that are not finite', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => asJulianDayTT(value)).toThrow(RangeError)
      expect(() => asJulianDayUT(value)).toThrow(RangeError)
    }
  })
})
