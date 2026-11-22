import {
  type AstronomyEngine,
  BODIES,
  type Body,
  type BodyState,
  EngineNotReadyError,
  type JulianDayTT,
  OutOfRangeError,
  type TimeRange,
  UnsupportedBodyError,
} from '../../src/engines/contract/index.ts'

/**
 * `mean + rate · t + amplitude · sin(2π · t / period + phase)`, with t in days from J2000.0.
 * Its derivative is exact, so the fake engine's speeds are not finite differences.
 */
interface Wave {
  mean: number
  rate: number
  amplitude: number
  period: number
  phase: number
}

interface SyntheticMotion {
  longitude: Wave
  latitude: Wave
  distance: Wave
}

const J2000 = 2451545

/**
 * Synthetic motion per body: a mean motion plus one oscillation. A planet is retrograde
 * while `amplitude · 2π / period > rate` makes its speed negative; the Sun and the Moon
 * never are. Plausible magnitudes, not real positions.
 */
const MOTION: Record<Body, SyntheticMotion> = {
  sun: {
    longitude: { mean: 280.5, rate: 0.9856, amplitude: 1.9, period: 365.26, phase: 0 },
    latitude: { mean: 0, rate: 0, amplitude: 0, period: 1, phase: 0 },
    distance: { mean: 1, rate: 0, amplitude: 0.0167, period: 365.26, phase: 1.5 },
  },
  moon: {
    longitude: { mean: 218.3, rate: 13.1764, amplitude: 6.3, period: 27.55, phase: 2.4 },
    latitude: { mean: 0, rate: 0, amplitude: 5.1, period: 27.21, phase: 1.6 },
    distance: { mean: 0.00257, rate: 0, amplitude: 0.00014, period: 27.55, phase: 0.8 },
  },
  mercury: {
    longitude: { mean: 252.3, rate: 0.9856, amplitude: 22, period: 115.88, phase: 0.3 },
    latitude: { mean: 0, rate: 0, amplitude: 3, period: 87.97, phase: 0.6 },
    distance: { mean: 1, rate: 0, amplitude: 0.4, period: 115.88, phase: 0.3 },
  },
  venus: {
    longitude: { mean: 181.9, rate: 0.9856, amplitude: 100, period: 583.92, phase: 1.1 },
    latitude: { mean: 0, rate: 0, amplitude: 3.4, period: 224.7, phase: 2.1 },
    distance: { mean: 1, rate: 0, amplitude: 0.72, period: 583.92, phase: 1.1 },
  },
  mars: {
    longitude: { mean: 355.4, rate: 0.524, amplitude: 70, period: 779.94, phase: 4.2 },
    latitude: { mean: 0, rate: 0, amplitude: 1.8, period: 686.98, phase: 0.9 },
    distance: { mean: 1.5, rate: 0, amplitude: 1, period: 779.94, phase: 4.2 },
  },
  jupiter: {
    longitude: { mean: 34.4, rate: 0.0831, amplitude: 11, period: 398.88, phase: 2.7 },
    latitude: { mean: 0, rate: 0, amplitude: 1.3, period: 4332.6, phase: 0.2 },
    distance: { mean: 5.2, rate: 0, amplitude: 1, period: 398.88, phase: 2.7 },
  },
  saturn: {
    longitude: { mean: 50.1, rate: 0.0335, amplitude: 6, period: 378.09, phase: 5.3 },
    latitude: { mean: 0, rate: 0, amplitude: 2.5, period: 10759, phase: 3.1 },
    distance: { mean: 9.5, rate: 0, amplitude: 1, period: 378.09, phase: 5.3 },
  },
  uranus: {
    longitude: { mean: 314.1, rate: 0.0117, amplitude: 3, period: 369.66, phase: 0.7 },
    latitude: { mean: 0, rate: 0, amplitude: 0.8, period: 30687, phase: 1.4 },
    distance: { mean: 19.2, rate: 0, amplitude: 1, period: 369.66, phase: 0.7 },
  },
  neptune: {
    longitude: { mean: 304.3, rate: 0.006, amplitude: 1.9, period: 367.49, phase: 3.9 },
    latitude: { mean: 0, rate: 0, amplitude: 1.8, period: 60190, phase: 2.6 },
    distance: { mean: 30.1, rate: 0, amplitude: 1, period: 367.49, phase: 3.9 },
  },
  pluto: {
    longitude: { mean: 238.9, rate: 0.004, amplitude: 1.5, period: 366.73, phase: 1.9 },
    latitude: { mean: 0, rate: 0, amplitude: 17, period: 90560, phase: 4.4 },
    distance: { mean: 39.5, rate: 0, amplitude: 1, period: 366.73, phase: 1.9 },
  },
}

function waveValue(wave: Wave, days: number): number {
  const angle = (2 * Math.PI * days) / wave.period + wave.phase
  return wave.mean + wave.rate * days + wave.amplitude * Math.sin(angle)
}

function waveSpeed(wave: Wave, days: number): number {
  const angle = (2 * Math.PI * days) / wave.period + wave.phase
  return wave.rate + ((wave.amplitude * 2 * Math.PI) / wave.period) * Math.cos(angle)
}

function normalize(degrees: number): number {
  const result = degrees % 360
  return result < 0 ? result + 360 : result
}

function contains(range: TimeRange, julianDay: number): boolean {
  return julianDay >= range.start && julianDay <= range.end
}

export interface FakeEngineOptions {
  /** Bodies the engine computes. Defaults to every body. */
  bodies?: readonly Body[]
  /** Validated range. Defaults to 1800–2200. */
  coverage?: TimeRange
}

/** Default coverage: 1800-01-01 to 2200-01-01, 0h TT. */
export const FAKE_COVERAGE: TimeRange = {
  start: 2378496.5 as JulianDayTT,
  end: 2524593.5 as JulianDayTT,
}

/**
 * An engine with synthetic motion, for tests. It follows every rule of the contract,
 * including `EngineNotReadyError` before `load()`, and is deterministic and cheap.
 */
export function createFakeEngine(options: FakeEngineOptions = {}): AstronomyEngine {
  const coverage = options.coverage ?? FAKE_COVERAGE
  const bodies: ReadonlySet<Body> = new Set(options.bodies ?? BODIES)
  const loaded: TimeRange[] = []
  const id = 'fake'

  return {
    info: {
      id,
      name: 'alfonsina-fake-engine',
      version: '0.0.0',
      license: 'MIT',
      source: 'Synthetic motion',
      coverage,
    },
    bodies,

    async load(range: TimeRange): Promise<void> {
      if (!contains(coverage, range.start) || !contains(coverage, range.end)) {
        throw new OutOfRangeError(id, range, coverage)
      }
      loaded.push(range)
    },

    state(body: Body, julianDay: JulianDayTT): BodyState {
      if (!bodies.has(body)) {
        throw new UnsupportedBodyError(id, body)
      }
      if (!contains(coverage, julianDay)) {
        throw new OutOfRangeError(id, julianDay, coverage)
      }
      if (!loaded.some((range) => contains(range, julianDay))) {
        throw new EngineNotReadyError(id, julianDay)
      }

      const motion = MOTION[body]
      const days = julianDay - J2000
      return {
        body,
        longitude: normalize(waveValue(motion.longitude, days)),
        latitude: waveValue(motion.latitude, days),
        distance: waveValue(motion.distance, days),
        longitudeSpeed: waveSpeed(motion.longitude, days),
        latitudeSpeed: waveSpeed(motion.latitude, days),
        distanceSpeed: waveSpeed(motion.distance, days),
      }
    },
  }
}
