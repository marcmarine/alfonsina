import { describe, expect, it } from 'vitest'
import { SIGNS } from './signs.ts'
import { signLongitude, signLongitudeParts, signOf } from './zodiac.ts'

describe('SIGNS', () => {
  it('lists the twelve signs in order from Aries', () => {
    expect(SIGNS).toHaveLength(12)
    expect(SIGNS[0]).toBe('aries')
    expect(SIGNS[11]).toBe('pisces')
  })
})

describe('signOf', () => {
  it('gives the sign that begins every 30°', () => {
    SIGNS.forEach((sign, index) => {
      expect(signOf(index * 30), sign).toBe(sign)
      expect(signOf(index * 30 + 29.999999), sign).toBe(sign)
    })
  })

  it('normalizes the longitude first', () => {
    expect(signOf(360)).toBe('aries')
    expect(signOf(-0.5)).toBe('pisces')
    expect(signOf(414.45)).toBe('taurus')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (longitude) => {
    expect(() => signOf(longitude)).toThrow(RangeError)
  })
})

describe('signLongitude', () => {
  it('gives the decimal degrees within the sign', () => {
    expect(signLongitude(54.45)).toBeCloseTo(24.45, 12)
    expect(signLongitude(0)).toBe(0)
    expect(signLongitude(359.5)).toBeCloseTo(29.5, 12)
    expect(signLongitude(-30.25)).toBeCloseTo(29.75, 12)
  })

  it('stays in [0, 30)', () => {
    for (const longitude of [-1e-15, 30, 59.999999999999, 360 - 1e-13]) {
      const result = signLongitude(longitude)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(30)
    }
  })

  it('rejects a longitude that is not finite', () => {
    expect(() => signLongitude(Number.NaN)).toThrow(RangeError)
  })
})

/** 24°27′29.9″ Taurus. */
const VENUS = 54 + 27 / 60 + 29.9 / 3600

describe('signLongitudeParts', () => {
  it('splits a longitude into sign, degrees, minutes and seconds', () => {
    expect(signLongitudeParts(VENUS)).toEqual({
      sign: 'taurus',
      degrees: 24,
      minutes: 27,
      seconds: 29,
    })
    expect(signLongitudeParts(0)).toEqual({ sign: 'aries', degrees: 0, minutes: 0, seconds: 0 })
  })

  it('truncates: it never reaches a second, a degree or a sign not reached yet', () => {
    expect(signLongitudeParts(60 - 0.1 / 3600)).toEqual({
      sign: 'taurus',
      degrees: 29,
      minutes: 59,
      seconds: 59,
    })
    expect(signLongitudeParts(360 - 1e-9).sign).toBe('pisces')
  })

  it('is not fooled by floating point just below an exact value', () => {
    // 24.45 × 3600 is 88019.99999999999 in floating point.
    expect(signLongitudeParts(54.45)).toEqual({
      sign: 'taurus',
      degrees: 24,
      minutes: 27,
      seconds: 0,
    })
    expect(signLongitudeParts(30 + 10 / 3600)).toEqual({
      sign: 'taurus',
      degrees: 0,
      minutes: 0,
      seconds: 10,
    })
  })

  it('normalizes the longitude first', () => {
    expect(signLongitudeParts(-0.5)).toEqual({
      sign: 'pisces',
      degrees: 29,
      minutes: 30,
      seconds: 0,
    })
    expect(signLongitudeParts(360)).toEqual({ sign: 'aries', degrees: 0, minutes: 0, seconds: 0 })
  })

  it('agrees with signOf on every sign', () => {
    for (let longitude = 0.5; longitude < 360; longitude += 7.3) {
      expect(signLongitudeParts(longitude).sign).toBe(signOf(longitude))
    }
  })

  it('rejects a longitude that is not finite', () => {
    expect(() => signLongitudeParts(Number.NaN)).toThrow(RangeError)
  })
})
