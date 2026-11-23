import { describe, expect, it } from 'vitest'
import { angles, houseOf, houses, isPlacidusDefined } from './houses.ts'

const OBLIQUITY = 23.44

/** Signed difference to − from in (−180, 180]. */
function difference(to: number, from: number): number {
  const result = (((to - from) % 360) + 360) % 360
  return result > 180 ? result - 360 : result
}

const LATITUDES = [-85, -66, -40, 0, 23.44, 40.4168, 60, 66, 70, 85]
const SIDEREAL_TIMES = Array.from({ length: 24 }, (_, index) => index * 15 + 7.5)

describe('angles', () => {
  it('puts 0° Aries on the meridian and 0° Cancer rising at the equator when ARMC is 0', () => {
    const result = angles(0, 0, OBLIQUITY)
    expect(result.mediumCoeli).toBeCloseTo(0, 10)
    expect(result.ascendant).toBeCloseTo(90, 10)
  })

  it('keeps the descendant and imum coeli opposite the ascendant and medium coeli', () => {
    for (const latitude of LATITUDES) {
      for (const siderealTime of SIDEREAL_TIMES) {
        const result = angles(siderealTime, latitude, OBLIQUITY)
        expect(Math.abs(difference(result.descendant, result.ascendant))).toBeCloseTo(180, 9)
        expect(Math.abs(difference(result.imumCoeli, result.mediumCoeli))).toBeCloseTo(180, 9)
      }
    }
  })

  it('gives a medium coeli whose right ascension is the sidereal time', () => {
    for (const siderealTime of SIDEREAL_TIMES) {
      const { mediumCoeli } = angles(siderealTime, 40, OBLIQUITY)
      const radians = (degrees: number) => (degrees * Math.PI) / 180
      const rightAscension =
        (Math.atan2(
          Math.sin(radians(mediumCoeli)) * Math.cos(radians(OBLIQUITY)),
          Math.cos(radians(mediumCoeli)),
        ) *
          180) /
        Math.PI
      expect(difference(rightAscension, siderealTime)).toBeCloseTo(0, 9)
    }
  })

  it('gives an ascendant on the eastern horizon at every latitude, polar ones included', () => {
    const radians = (degrees: number) => (degrees * Math.PI) / 180
    for (const latitude of LATITUDES) {
      for (const siderealTime of SIDEREAL_TIMES) {
        const { ascendant } = angles(siderealTime, latitude, OBLIQUITY)
        const declination = Math.asin(Math.sin(radians(OBLIQUITY)) * Math.sin(radians(ascendant)))
        const rightAscension = Math.atan2(
          Math.sin(radians(ascendant)) * Math.cos(radians(OBLIQUITY)),
          Math.cos(radians(ascendant)),
        )
        const hourAngle = radians(siderealTime) - rightAscension
        const altitude = Math.asin(
          Math.sin(radians(latitude)) * Math.sin(declination) +
            Math.cos(radians(latitude)) * Math.cos(declination) * Math.cos(hourAngle),
        )
        const where = `latitude ${latitude}, ARMC ${siderealTime}`
        expect(altitude, where).toBeCloseTo(0, 9)
        expect(Math.sin(hourAngle), `${where}: east of the meridian`).toBeLessThan(0)
      }
    }
  })
})

describe('isPlacidusDefined', () => {
  it('holds inside the polar circles only', () => {
    expect(isPlacidusDefined(66.5, OBLIQUITY)).toBe(true)
    expect(isPlacidusDefined(-66.5, OBLIQUITY)).toBe(true)
    expect(isPlacidusDefined(90 - OBLIQUITY, OBLIQUITY)).toBe(false)
    expect(isPlacidusDefined(-70, OBLIQUITY)).toBe(false)
  })
})

describe('houses', () => {
  it('gives Placidus cusps with the angles on cusps 1, 4, 7 and 10', () => {
    for (const latitude of [-60, -33.9, 0, 40.4168, 66]) {
      for (const siderealTime of SIDEREAL_TIMES) {
        const { houses: result, warnings } = houses('placidus', siderealTime, latitude, OBLIQUITY)
        const point = angles(siderealTime, latitude, OBLIQUITY)
        expect(result.system).toBe('placidus')
        expect(warnings).toEqual([])
        expect(result.cusps).toHaveLength(12)
        expect(result.cusps[0]).toBeCloseTo(point.ascendant, 9)
        expect(result.cusps[3]).toBeCloseTo(point.imumCoeli, 9)
        expect(result.cusps[6]).toBeCloseTo(point.descendant, 9)
        expect(result.cusps[9]).toBeCloseTo(point.mediumCoeli, 9)
      }
    }
  })

  it('gives Placidus cusps in zodiacal order, each opposite the one six houses away', () => {
    for (const latitude of [-60, 0, 40.4168, 66]) {
      for (const siderealTime of SIDEREAL_TIMES) {
        const { cusps } = houses('placidus', siderealTime, latitude, OBLIQUITY).houses
        const where = `latitude ${latitude}, ARMC ${siderealTime}`
        let total = 0
        for (let index = 0; index < 12; index += 1) {
          const width = difference(cusps[(index + 1) % 12] as number, cusps[index] as number)
          expect(width, `${where}, house ${index + 1}`).toBeGreaterThan(0)
          total += width
          if (index < 6) {
            const opposite = difference(cusps[index + 6] as number, cusps[index] as number)
            expect(Math.abs(opposite), where).toBeCloseTo(180, 9)
          }
        }
        expect(total, where).toBeCloseTo(360, 9)
      }
    }
  })

  it('gives whole-sign cusps from the start of the ascendant sign, 30° apart', () => {
    const { ascendant } = angles(100, 40.4168, OBLIQUITY)
    const { houses: result, warnings } = houses('whole-sign', 100, 40.4168, OBLIQUITY)
    const first = Math.floor(ascendant / 30) * 30
    expect(result.system).toBe('whole-sign')
    expect(warnings).toEqual([])
    expect(result.cusps).toEqual(
      Array.from({ length: 12 }, (_, index) => (first + 30 * index) % 360),
    )
  })

  it('falls back to whole-sign houses with a warning where Placidus is undefined', () => {
    const { houses: result, warnings } = houses('placidus', 100, 69.65, OBLIQUITY)
    expect(result).toEqual(houses('whole-sign', 100, 69.65, OBLIQUITY).houses)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.code).toBe('PLACIDUS_UNDEFINED')
    expect(warnings[0]?.message).toContain('69.65')
  })

  it('gives no warning for whole-sign houses asked for at a polar latitude', () => {
    expect(houses('whole-sign', 100, -80, OBLIQUITY).warnings).toEqual([])
  })
})

describe('houseOf', () => {
  const cusps = [100, 125, 152, 182, 214, 247, 280, 305, 332, 2, 34, 67]

  it('gives the house whose cusp a longitude is at or past', () => {
    expect(houseOf(100, cusps)).toBe(1)
    expect(houseOf(124.9, cusps)).toBe(1)
    expect(houseOf(125, cusps)).toBe(2)
    expect(houseOf(300, cusps)).toBe(7)
  })

  it('handles the house that crosses 0° Aries', () => {
    expect(houseOf(340, cusps)).toBe(9)
    expect(houseOf(1, cusps)).toBe(9)
    expect(houseOf(2, cusps)).toBe(10)
    expect(houseOf(80, cusps)).toBe(12)
    expect(houseOf(99.999, cusps)).toBe(12)
  })

  it('normalizes the longitude first', () => {
    expect(houseOf(-20, cusps)).toBe(9)
    expect(houseOf(460, cusps)).toBe(1)
  })

  it('places every degree in exactly the house its cusps bound', () => {
    const placidus = houses('placidus', 211.3, 40.4168, OBLIQUITY).houses.cusps
    for (let longitude = 0; longitude < 360; longitude += 0.5) {
      const house = houseOf(longitude, placidus)
      const start = placidus[house - 1] as number
      const end = placidus[house % 12] as number
      expect(difference(longitude, start)).toBeGreaterThanOrEqual(0)
      expect(difference(end, longitude)).toBeGreaterThan(0)
    }
  })
})
