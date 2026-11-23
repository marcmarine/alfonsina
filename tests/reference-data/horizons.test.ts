import { describe, expect, it } from 'vitest'
import { caelusEngine } from '../../src/engines/caelus/index.ts'
import {
  type AstronomyEngine,
  BODIES,
  type Body,
  type JulianDayTT,
} from '../../src/engines/contract/index.ts'
import { naelosEngine } from '../../src/engines/naelos/index.ts'
import reference from './horizons.json' with { type: 'json' }

/**
 * Largest accepted difference from JPL Horizons for one body.
 *
 * Longitude and latitude are in arcseconds, distance is relative, speeds are in degrees or
 * AU per day.
 */
interface Tolerance {
  longitude: number
  latitude: number
  distance: number
  longitudeSpeed: number
  latitudeSpeed: number
  distanceSpeed: number
}

/**
 * Horizons refers "ecliptic of date" to the IAU 1976/1980 precession and nutation, while
 * the engines use later models (IAU 2006, Vondrák 2011). The frames drift apart by about
 * 0.33″ per century from J2000, equally for every body: a convention, not a position
 * error. Angular tolerances grow by this much per century.
 */
const FRAME_DRIFT_PER_CENTURY = 0.4

/**
 * Tolerances per engine and body, measured against `horizons.json` with some margin.
 * Measured maxima, without the frame drift: naelos 0.05″ in 1885–2100; caelus 0.2–0.5″
 * from the Sun to Saturn, 1.5″ Uranus, 2.5″ Neptune, 3″ Pluto (Meeus series) and 6″ the
 * Moon (abridged series). caelus distances are about 1e-4 off, which no chart uses.
 */
const TOLERANCES: Record<string, (body: Body) => Tolerance> = {
  naelos: (body) => ({
    longitude: 0.2,
    latitude: 0.2,
    distance: 1e-7,
    longitudeSpeed: body === 'moon' ? 5e-4 : 1e-4,
    latitudeSpeed: body === 'moon' ? 5e-4 : 1e-4,
    distanceSpeed: 2e-5,
  }),
  caelus: (body) => ({
    longitude: { moon: 10, uranus: 2, neptune: 3.5, pluto: 4 }[body as string] ?? 1,
    latitude: { moon: 3, jupiter: 1.5 }[body as string] ?? 1,
    distance: { sun: 2e-6, pluto: 2e-5 }[body as string] ?? 2e-4,
    longitudeSpeed: body === 'moon' ? 5e-3 : 1e-3,
    latitudeSpeed: body === 'moon' ? 5e-3 : 1e-3,
    distanceSpeed: 1e-4,
  }),
}

type Sample = [number, number, number, number, number, number, number]

const J2000 = 2451545

/** Difference between two longitudes across the 360° → 0° wrap, in [−180, 180). */
function longitudeDifference(to: number, from: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

function samplesOf(body: Body, engine: AstronomyEngine): Sample[] {
  const { start, end } = engine.info.coverage
  return (reference.bodies[body] as Sample[]).filter(
    ([instant]) => instant >= start && instant <= end,
  )
}

describe.each([
  ['caelus', caelusEngine],
  ['naelos', naelosEngine],
] as const)('%s against JPL Horizons', (id, createEngine) => {
  const engine = createEngine()
  const toleranceOf = TOLERANCES[id] as (body: Body) => Tolerance

  it.each(BODIES)('matches the positions and speeds of %s', async (body) => {
    await engine.load(engine.info.coverage)
    const tolerance = toleranceOf(body)
    const samples = samplesOf(body, engine)
    // Guards against a vacuous pass if the data or the coverage filter leave few samples.
    expect(samples.length, 'reference samples within the coverage').toBeGreaterThanOrEqual(40)
    for (const sample of samples) {
      const [instant, longitude, latitude, distance, longitudeSpeed, latitudeSpeed, distanceSpeed] =
        sample
      const state = engine.state(body, instant as JulianDayTT)
      const drift = FRAME_DRIFT_PER_CENTURY * Math.abs((instant - J2000) / 36525)
      const where = `${body} at JD ${instant} TT`

      expect(
        Math.abs(longitudeDifference(state.longitude, longitude)) * 3600,
        `${where}, longitude (″)`,
      ).toBeLessThan(tolerance.longitude + drift)
      expect(Math.abs(state.latitude - latitude) * 3600, `${where}, latitude (″)`).toBeLessThan(
        tolerance.latitude + drift,
      )
      expect(Math.abs(state.distance - distance) / distance, `${where}, distance`).toBeLessThan(
        tolerance.distance,
      )
      expect(
        Math.abs(state.longitudeSpeed - longitudeSpeed),
        `${where}, longitude speed`,
      ).toBeLessThan(tolerance.longitudeSpeed)
      expect(
        Math.abs(state.latitudeSpeed - latitudeSpeed),
        `${where}, latitude speed`,
      ).toBeLessThan(tolerance.latitudeSpeed)
      expect(
        Math.abs(state.distanceSpeed - distanceSpeed),
        `${where}, distance speed`,
      ).toBeLessThan(tolerance.distanceSpeed)
    }
  })
})
