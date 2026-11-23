// Angles and houses against naelos-ephemeris, an independent implementation that follows
// Swiss Ephemeris. Given the same sidereal time (ARMC) and obliquity, the geometry must
// agree to rounding; with Alfonsina's own sidereal time and obliquity, to a fraction of an
// arcsecond.

import { NaelosEphemeris, SE_ECL_NUT } from 'naelos-ephemeris'
import { beforeAll, describe, expect, it } from 'vitest'
import { angles, houses, isPlacidusDefined } from '../../src/astrology/houses/index.ts'
import { earth, time } from '../../src/core/index.ts'
import { readPackageTable } from '../../src/engines/naelos/naelos.ts'

let ephemeris: NaelosEphemeris

beforeAll(async () => {
  ephemeris = NaelosEphemeris.fromBuffers(
    await Promise.all(['ne-1900.bin', 'ne-2000.bin'].map(readPackageTable)),
  )
})

/** Absolute difference between two longitudes, in degrees. */
function distance(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180)
}

/** naelos's sidereal time, true obliquity and Placidus houses for a UT instant and place. */
function reference(julianDayUT: number, latitude: number, longitude: number) {
  const julianDayTT = julianDayUT + ephemeris.deltat(julianDayUT)
  const nutation = ephemeris.calc(julianDayTT, SE_ECL_NUT, 0)
  if ('error' in nutation) throw new Error(nutation.error)
  return {
    obliquity: nutation.longitude,
    ...ephemeris.houses(julianDayUT, latitude, longitude, 'P'),
  }
}

describe('angles and houses against naelos-ephemeris', () => {
  it('agree on the angles at every latitude, and on Placidus wherever it is defined', () => {
    for (let latitude = -89; latitude <= 89; latitude += 4) {
      for (let step = 0; step < 24; step += 1) {
        const julianDayUT = 2448027 + step / 24 + latitude * 3.7
        const naelos = reference(julianDayUT, latitude, 0)
        const ours = angles(naelos.armc, latitude, naelos.obliquity)
        const where = `latitude ${latitude}, JD ${julianDayUT} UT`

        expect(distance(ours.ascendant, naelos.ascendant), `${where}, ascendant`).toBeLessThan(1e-8)
        expect(distance(ours.mediumCoeli, naelos.mc), `${where}, medium coeli`).toBeLessThan(1e-8)
        // naelos draws Porphyry where Placidus is undefined; Alfonsina draws whole-sign.
        expect(isPlacidusDefined(latitude, naelos.obliquity), where).toBe(!naelos.fallback)
        if (!naelos.fallback) {
          const { cusps } = houses('placidus', naelos.armc, latitude, naelos.obliquity).houses
          cusps.forEach((cusp, index) => {
            expect(
              distance(cusp, naelos.cusps[index] as number),
              `${where}, cusp ${index + 1}`,
            ).toBeLessThan(1e-8)
          })
        }
      }
    }
  })

  it('agree within 0.1″ when Alfonsina computes its own sidereal time and obliquity', () => {
    // Madrid, 1990-05-15 12:30 UTC.
    const instant = time.fromUTC('1990-05-15T12:30:00Z')
    const location = { latitude: 40.4168, longitude: -3.7038 }
    const siderealTime = earth.apparentSiderealTime(instant, location.longitude)
    const obliquity = earth.trueObliquity(instant.julianDayTT)
    const naelos = reference(instant.julianDayUT, location.latitude, location.longitude)

    expect(distance(siderealTime, naelos.armc) * 3600).toBeLessThan(0.1)
    const ours = houses('placidus', siderealTime, location.latitude, obliquity).houses.cusps
    ours.forEach((cusp, index) => {
      expect(
        distance(cusp, naelos.cusps[index] as number) * 3600,
        `cusp ${index + 1}`,
      ).toBeLessThan(0.1)
    })
  })
})
