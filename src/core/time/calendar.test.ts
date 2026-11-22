import { describe, expect, it } from 'vitest'
import { decimalYearFromJulianDay, julianDayFromUTC, utcFromJulianDay } from './calendar.ts'
import { InvalidDateError } from './errors.ts'

describe('julianDayFromUTC', () => {
  it.each([
    ['2000-01-01T12:00:00Z', 2451545],
    ['1957-10-04T19:26:24Z', 2436116.31],
    ['1987-01-27', 2446822.5],
    ['1988-06-19T12:00', 2447332],
    ['1970-01-01', 2440587.5],
    ['1900-01-01', 2415020.5],
    ['1600-01-01', 2305447.5],
    ['1600-12-31', 2305812.5],
    ['0000-01-01', 1721059.5],
    ['-004713-11-24T12:00:00Z', 0],
  ])('%s is JD %d', (utc, julianDay) => {
    expect(julianDayFromUTC(utc)).toBeCloseTo(julianDay, 8)
  })

  it('reads seconds and fractions of a second', () => {
    const base = julianDayFromUTC('1990-05-15T12:30:00Z')
    // A Julian Day near 2.4 million resolves about 40 µs, so compare to 0.1 ms.
    const seconds = (julianDayFromUTC('1990-05-15T12:30:15.5Z') - base) * 86_400
    expect(seconds).toBeCloseTo(15.5, 4)
  })

  it('accepts the trailing Z as optional', () => {
    expect(julianDayFromUTC('1990-05-15T12:30')).toBe(julianDayFromUTC('1990-05-15T12:30:00Z'))
  })

  it('follows the Gregorian leap-year rules for every year', () => {
    expect(() => julianDayFromUTC('2000-02-29')).not.toThrow()
    expect(() => julianDayFromUTC('2024-02-29')).not.toThrow()
    expect(() => julianDayFromUTC('1900-02-29')).toThrow(InvalidDateError)
    expect(() => julianDayFromUTC('1500-02-29')).toThrow(InvalidDateError)
  })

  it('is proleptic Gregorian across the 1582 reform', () => {
    expect(julianDayFromUTC('1582-10-15') - julianDayFromUTC('1582-10-04')).toBe(11)
    expect(() => julianDayFromUTC('1582-10-10')).not.toThrow()
  })

  it.each([
    '',
    'yesterday',
    '1990-5-15',
    '90-05-15',
    '1990-05-15 12:30',
    '1990-05-15T12',
    '1990-05-15Z',
    '1990-05-15T12:30:00+02:00',
    '1990-05-15T12:30:00.Z',
    '-0500-01-01',
    '1990-00-10',
    '1990-13-01',
    '1990-02-30',
    '1990-04-31',
    '1990-05-00',
    '1990-05-15T24:00',
    '1990-05-15T12:60',
    '1990-12-31T23:59:60Z',
  ])('rejects %j with InvalidDateError', (input) => {
    expect(() => julianDayFromUTC(input)).toThrow(InvalidDateError)
  })

  it('explains what is wrong and how to fix it', () => {
    try {
      julianDayFromUTC('1990-02-30')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDateError)
      const invalid = error as InvalidDateError
      expect(invalid.code).toBe('INVALID_DATE')
      expect(invalid.input).toBe('1990-02-30')
      expect(invalid.message).toContain('day 30')
      expect(invalid.suggestion.length).toBeGreaterThan(0)
    }
  })
})

describe('utcFromJulianDay', () => {
  it.each([
    [2451545, '2000-01-01T12:00:00Z'],
    [2436116.31, '1957-10-04T19:26:24Z'],
    [2440587.5, '1970-01-01T00:00:00Z'],
    [1721059.5, '0000-01-01T00:00:00Z'],
    [0, '-004713-11-24T12:00:00Z'],
    [5373484.5, '+010000-01-01T00:00:00Z'],
  ])('JD %d is %s', (julianDay, utc) => {
    expect(utcFromJulianDay(julianDay)).toBe(utc)
  })

  it('writes milliseconds only when they are not zero', () => {
    const base = julianDayFromUTC('1990-05-15T12:30:00Z')
    expect(utcFromJulianDay(base + 0.25 / 86_400)).toBe('1990-05-15T12:30:00.250Z')
  })

  it('rounds to the millisecond, carrying into the next day', () => {
    const midnight = julianDayFromUTC('1990-05-16')
    expect(utcFromJulianDay(midnight - 0.0001 / 86_400)).toBe('1990-05-16T00:00:00Z')
  })

  it('round-trips with julianDayFromUTC', () => {
    for (const utc of [
      '1990-05-15T12:30:00Z',
      '1657-03-01T06:07:08.009Z',
      '2099-12-31T23:59:59.999Z',
      '0001-01-01T00:00:00Z',
      '-001000-07-12T12:00:00Z',
    ]) {
      expect(utcFromJulianDay(julianDayFromUTC(utc))).toBe(utc)
    }
  })
})

describe('decimalYearFromJulianDay', () => {
  it('is a whole number on January 1 at 0h', () => {
    for (const utc of ['1657-01-01', '2000-01-01', '0000-01-01', '-000500-01-01']) {
      const year = decimalYearFromJulianDay(julianDayFromUTC(utc))
      expect(year).toBe(Math.round(year))
    }
  })

  it('counts the fraction of the year elapsed, leap years included', () => {
    expect(decimalYearFromJulianDay(julianDayFromUTC('2001-07-02T12:00'))).toBeCloseTo(2001.5, 9)
    expect(decimalYearFromJulianDay(julianDayFromUTC('2000-07-02'))).toBeCloseTo(2000.5, 9)
  })
})
