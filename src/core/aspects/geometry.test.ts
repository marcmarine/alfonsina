import { describe, expect, it } from 'vitest'
import { ASPECT_NAMES, exactAngle, offset } from './geometry.ts'

describe('exactAngle', () => {
  it('gives the angle of each major aspect', () => {
    expect(ASPECT_NAMES.map(exactAngle)).toEqual([0, 60, 90, 120, 180])
  })
})

describe('offset', () => {
  it('is zero at an exact aspect, on either side', () => {
    expect(offset(100, 10, 90)).toBe(0)
    expect(offset(280, 10, 90)).toBe(0)
    expect(offset(130, 10, 120)).toBe(0)
    expect(offset(250, 10, 120)).toBe(0)
    expect(offset(10, 10, 0)).toBe(0)
    expect(offset(190, 10, 180)).toBe(0)
  })

  it('is positive past the exact point in zodiacal order and negative short of it', () => {
    // B at 10°: squares are exact at 100° and at 280°
    expect(offset(103, 10, 90)).toBeCloseTo(3, 10)
    expect(offset(97, 10, 90)).toBeCloseTo(-3, 10)
    expect(offset(283, 10, 90)).toBeCloseTo(3, 10)
    expect(offset(277, 10, 90)).toBeCloseTo(-3, 10)
  })

  it('works across 0° Aries', () => {
    expect(offset(2, 350, 0)).toBeCloseTo(12, 10)
    expect(offset(350, 2, 0)).toBeCloseTo(-12, 10)
    expect(offset(85, 355, 90)).toBeCloseTo(0, 10)
    expect(offset(268, 355, 90)).toBeCloseTo(3, 10)
  })

  it('measures conjunctions and oppositions from their single exact point', () => {
    expect(offset(15, 10, 0)).toBeCloseTo(5, 10)
    expect(offset(5, 10, 0)).toBeCloseTo(-5, 10)
    expect(offset(195, 10, 180)).toBeCloseTo(5, 10)
    expect(offset(185, 10, 180)).toBeCloseTo(-5, 10)
  })

  it('stays within (−180, 180]', () => {
    for (let longitudeA = 0; longitudeA < 360; longitudeA += 7.3) {
      for (const angle of [0, 60, 90, 120, 180]) {
        const result = offset(longitudeA, 123.4, angle)
        expect(result).toBeGreaterThan(-180)
        expect(result).toBeLessThanOrEqual(180)
      }
    }
  })

  it('changes sign through every exact aspect as A moves', () => {
    const longitudeB = 40
    for (const angle of [60, 90, 120]) {
      let crossings = 0
      let previous = offset(0, longitudeB, angle)
      for (let longitudeA = 0.5; longitudeA < 360; longitudeA += 0.5) {
        const current = offset(longitudeA, longitudeB, angle)
        // Count only true crossings: sign changes near zero, not the jumps far from it.
        const crossed = (previous < 0 && current >= 0) || (previous > 0 && current <= 0)
        if (crossed && Math.abs(current - previous) < 10) {
          crossings++
        }
        previous = current
      }
      expect(crossings, `${angle}°`).toBe(2)
    }
  })

  it('is not the signed orb: its sign depends on position, not on motion', () => {
    // A past the exact square by 2°, whether it moves forward (separating) or back
    // (retrograde, applying): the offset is +2 in both cases.
    expect(offset(102, 10, 90)).toBeCloseTo(2, 10)
  })
})
