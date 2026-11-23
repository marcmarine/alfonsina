import { describe, expect, it } from 'vitest'
import { type AspectName, exactAngle } from '../../core/aspects/index.ts'
import { aspectsWithin, DEFAULT_ORBS, findAspects } from './aspects.ts'

describe('findAspects', () => {
  it('finds an aspect within its orb, with separation, orb and exact angle', () => {
    const result = findAspects(
      { sun: { longitude: 54.45, longitudeSpeed: 0.97 } },
      { moon: { longitude: 297.42, longitudeSpeed: 13.2 } },
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ between: ['sun', 'moon'], aspect: 'trine', exactAngle: 120 })
    expect(result[0]?.separation).toBeCloseTo(117.03, 10)
    expect(result[0]?.orb).toBeCloseTo(2.97, 10)
  })

  it('measures the separation across 0° Aries', () => {
    const [found] = findAspects({ venus: { longitude: 358 } }, { mars: { longitude: 3 } })
    expect(found).toMatchObject({ aspect: 'conjunction' })
    expect(found?.separation).toBeCloseTo(5, 10)
  })

  it('uses the default orbs, inclusive', () => {
    for (const [aspect, orb] of Object.entries(DEFAULT_ORBS)) {
      const exact = exactAngle(aspect as AspectName)
      const at = (separation: number) =>
        findAspects({ sun: { longitude: 0 } }, { moon: { longitude: separation } })
      expect(at(exact - orb + 0.5)[0]?.aspect, aspect).toBe(aspect)
      expect(at(Math.abs(exact - orb))[0]?.aspect, aspect).toBe(aspect)
      expect(at(exact === 0 ? orb + 0.25 : exact - orb - 0.25), aspect).toEqual([])
    }
  })

  it('takes custom orbs per aspect, keeping the defaults for the rest', () => {
    const points = { sun: { longitude: 0 } }
    expect(findAspects(points, { moon: { longitude: 9.5 } })).toEqual([])
    expect(
      findAspects(points, { moon: { longitude: 9.5 } }, { orbs: { conjunction: 10 } })[0]?.aspect,
    ).toBe('conjunction')
    expect(
      findAspects(points, { moon: { longitude: 96.5 } }, { orbs: { conjunction: 10 } })[0]?.aspect,
    ).toBe('square')
  })

  it('looks only for the aspects asked for', () => {
    const pointsA = { sun: { longitude: 0 } }
    const pointsB = { moon: { longitude: 90 }, mars: { longitude: 180 } }
    expect(findAspects(pointsA, pointsB, { aspects: ['opposition'] }).map((a) => a.aspect)).toEqual(
      ['opposition'],
    )
    expect(findAspects(pointsA, pointsB, { aspects: [] })).toEqual([])
  })

  it('picks the aspect with the smaller orb when wide orbs overlap', () => {
    const [found] = findAspects(
      { sun: { longitude: 0 } },
      { moon: { longitude: 50 } },
      { orbs: { conjunction: 60, sextile: 20 } },
    )
    expect(found?.aspect).toBe('sextile')
  })

  it('tells applying from separating, whichever point moves', () => {
    // Sun at 0°, Moon 5° short of the square at 85°: the Moon moving forward applies.
    const sun = { longitude: 0, longitudeSpeed: 1 }
    expect(findAspects({ sun }, { moon: { longitude: 85, longitudeSpeed: 13 } })[0]?.applying).toBe(
      true,
    )
    expect(findAspects({ sun }, { moon: { longitude: 95, longitudeSpeed: 13 } })[0]?.applying).toBe(
      false,
    )
    // Retrograde past the exact square: moving back towards it applies.
    expect(
      findAspects({ sun }, { mars: { longitude: 92, longitudeSpeed: -0.3 } })[0]?.applying,
    ).toBe(true)
    // The faster point behind closes the gap of a conjunction, from either side of the pair.
    const moon = { longitude: 355, longitudeSpeed: 13 }
    expect(findAspects({ sun }, { moon })[0]?.applying).toBe(true)
    expect(findAspects({ moon }, { sun })[0]?.applying).toBe(true)
    // The same holds on the other side of a square: short of the exact point at 270°.
    expect(
      findAspects({ sun }, { moon: { longitude: 265, longitudeSpeed: 13 } })[0]?.applying,
    ).toBe(true)
  })

  it('treats a point without speed, such as an angle, as stationary', () => {
    const ascendant = { longitude: 100 }
    expect(
      findAspects({ mercury: { longitude: 7, longitudeSpeed: 1.2 } }, { ascendant })[0],
    ).toMatchObject({ aspect: 'square', applying: true })
    expect(
      findAspects({ mercury: { longitude: 13, longitudeSpeed: 1.2 } }, { ascendant })[0],
    ).toMatchObject({ aspect: 'square', applying: false })
    expect(findAspects({ ascendant }, { mediumCoeli: { longitude: 10 } })[0]).toMatchObject({
      aspect: 'square',
      applying: false,
    })
  })

  it('is not applying at the exact aspect', () => {
    const [found] = findAspects(
      { sun: { longitude: 10, longitudeSpeed: 1 } },
      { moon: { longitude: 130, longitudeSpeed: 13 } },
    )
    expect(found).toMatchObject({ aspect: 'trine', orb: 0, applying: false })
  })

  it('pairs every point of A with every point of B, A first, in traditional order', () => {
    const pointsA = { moon: { longitude: 6 }, sun: { longitude: 0 } }
    const pointsB = { ascendant: { longitude: 2 }, sun: { longitude: 1 } }
    expect(findAspects(pointsA, pointsB).map((a) => a.between)).toEqual([
      ['sun', 'sun'],
      ['sun', 'ascendant'],
      ['moon', 'sun'],
      ['moon', 'ascendant'],
    ])
  })

  it('rejects unknown aspects and invalid orbs', () => {
    const points = { sun: { longitude: 0 } }
    // @ts-expect-error: not an aspect name
    expect(() => findAspects(points, points, { aspects: ['quincunx'] })).toThrow(RangeError)
    expect(() => findAspects(points, points, { orbs: { trine: -1 } })).toThrow(RangeError)
    expect(() => findAspects(points, points, { orbs: { trine: Number.NaN } })).toThrow(RangeError)
  })
})

describe('aspectsWithin', () => {
  const points = {
    ascendant: { longitude: 100 },
    descendant: { longitude: 280 },
    mediumCoeli: { longitude: 10 },
    imumCoeli: { longitude: 190 },
    moon: { longitude: 102, longitudeSpeed: 13 },
    sun: { longitude: 10, longitudeSpeed: 1 },
  }

  it('gives each pair once, in traditional order, never a point with itself', () => {
    expect(aspectsWithin(points).map((a) => [...a.between, a.aspect])).toEqual([
      ['sun', 'moon', 'square'],
      ['sun', 'ascendant', 'square'],
      ['sun', 'mediumCoeli', 'conjunction'],
      ['sun', 'descendant', 'square'],
      ['sun', 'imumCoeli', 'opposition'],
      ['moon', 'ascendant', 'conjunction'],
      ['moon', 'mediumCoeli', 'square'],
      ['moon', 'descendant', 'opposition'],
      ['moon', 'imumCoeli', 'square'],
    ])
  })

  it('skips pairs of two angles', () => {
    expect(
      aspectsWithin(points).some((a) => a.between.every((p) => p !== 'sun' && p !== 'moon')),
    ).toBe(false)
  })

  it('takes the same options as findAspects', () => {
    expect(aspectsWithin(points, { aspects: ['conjunction'] }).map((a) => a.between)).toEqual([
      ['sun', 'mediumCoeli'],
      ['moon', 'ascendant'],
    ])
  })
})
