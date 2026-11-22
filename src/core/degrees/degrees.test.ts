import { describe, expect, it } from 'vitest'
import { normalize, normalizeSigned } from './degrees.ts'

describe('normalize', () => {
  it.each([
    [0, 0],
    [45, 45],
    [359.5, 359.5],
    [360, 0],
    [720, 0],
    [361, 1],
    [-1, 359],
    [-360, 0],
    [-725, 355],
    [1e6, 1e6 % 360],
  ])('%d → %d', (value, expected) => {
    expect(normalize(value)).toBeCloseTo(expected, 10)
  })

  it('never returns 360 for tiny negative values', () => {
    expect(normalize(-1e-15)).toBe(0)
    expect(normalize(-Number.MIN_VALUE)).toBe(0)
  })

  it('returns 0, not −0', () => {
    expect(Object.is(normalize(-0), 0)).toBe(true)
    expect(Object.is(normalize(-360), 0)).toBe(true)
  })

  it('stays within [0, 360) for many values', () => {
    for (let value = -1000; value <= 1000; value += 0.7) {
      const result = normalize(value)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(360)
    }
  })
})

describe('normalizeSigned', () => {
  it.each([
    [0, 0],
    [180, 180],
    [-180, 180],
    [181, -179],
    [359, -1],
    [-90, -90],
    [540, 180],
  ])('%d → %d', (value, expected) => {
    expect(normalizeSigned(value)).toBeCloseTo(expected, 10)
  })
})
