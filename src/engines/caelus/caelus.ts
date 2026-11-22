import { Engine, VERSION } from 'caelus'
import { embeddedData } from 'caelus/data-embedded'
import {
  type AstronomyEngine,
  BODIES,
  type Body,
  type BodyState,
  type JulianDayTT,
  OutOfRangeError,
  type TimeRange,
  UnsupportedBodyError,
} from '../contract/index.ts'

const ID = 'caelus'

/**
 * 1885-01-01 to 2100-01-01, 0h TT. Bounded by Pluto: with the embedded data caelus
 * computes it with the Meeus chapter 37 series, valid 1885–2099. Every other body is
 * validated over a wider span.
 */
export const CAELUS_COVERAGE: TimeRange = {
  start: 2409542.5 as JulianDayTT,
  end: 2488069.5 as JulianDayTT,
}

/**
 * Half step of the central differences that give the speeds, in days. caelus returns
 * smooth analytic series, so a short step keeps the truncation error far below the
 * engine's precision without amplifying rounding.
 */
const SPEED_STEP = 0.01

const DEGREES_PER_RADIAN = 180 / Math.PI

/** Difference between two longitudes in radians across the 2π → 0 wrap, in [−π, π). */
function longitudeDifference(to: number, from: number): number {
  const turn = 2 * Math.PI
  return ((((to - from) % turn) + 1.5 * turn) % turn) - Math.PI
}

/** Radians to degrees in [0, 360). caelus does not promise a normalized longitude. */
function longitudeInDegrees(radians: number): number {
  const degrees = (radians * DEGREES_PER_RADIAN) % 360
  const result = degrees < 0 ? degrees + 360 : degrees
  // Rounding can turn a value just below 360 into 360 itself.
  return result >= 360 ? 0 : result
}

function contains(range: TimeRange, julianDay: number): boolean {
  return julianDay >= range.start && julianDay <= range.end
}

/**
 * Engine backed by caelus with its embedded data: no files to load, synchronous from the
 * first call. `state()` answers anywhere in the coverage, before or after `load()`.
 *
 * caelus gives apparent geocentric positions (true equinox of date) at a TT instant but no
 * speeds, so the adapter derives them by central differences.
 */
export function caelusEngine(): AstronomyEngine {
  const engine = new Engine(embeddedData)
  const bodies: ReadonlySet<Body> = new Set(BODIES)

  function ecliptic(body: Body, julianDay: number): [number, number, number] {
    const [longitude, latitude, distance] = engine.ecliptic(body, julianDay)
    // Only nodes and Lilith have no distance, and they are not in `BODIES`.
    return [longitude, latitude, distance as number]
  }

  return {
    info: {
      id: ID,
      name: 'caelus',
      version: VERSION,
      license: 'MIT',
      source: 'VSOP87D and Meeus series (embedded data)',
      coverage: CAELUS_COVERAGE,
    },
    bodies,

    async load(range: TimeRange): Promise<void> {
      if (!contains(CAELUS_COVERAGE, range.start) || !contains(CAELUS_COVERAGE, range.end)) {
        throw new OutOfRangeError(ID, range, CAELUS_COVERAGE)
      }
    },

    state(body: Body, julianDay: JulianDayTT): BodyState {
      if (!bodies.has(body)) {
        throw new UnsupportedBodyError(ID, body)
      }
      if (!contains(CAELUS_COVERAGE, julianDay)) {
        throw new OutOfRangeError(ID, julianDay, CAELUS_COVERAGE)
      }

      const [longitude, latitude, distance] = ecliptic(body, julianDay)
      const before = ecliptic(body, julianDay - SPEED_STEP)
      const after = ecliptic(body, julianDay + SPEED_STEP)
      const span = 2 * SPEED_STEP

      return {
        body,
        longitude: longitudeInDegrees(longitude),
        latitude: latitude * DEGREES_PER_RADIAN,
        distance,
        longitudeSpeed: (longitudeDifference(after[0], before[0]) / span) * DEGREES_PER_RADIAN,
        latitudeSpeed: ((after[1] - before[1]) / span) * DEGREES_PER_RADIAN,
        distanceSpeed: (after[2] - before[2]) / span,
      }
    },
  }
}
