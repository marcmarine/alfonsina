import { beforeAll, describe, expect, it } from 'vitest'
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

/** Tolerances between the reported speeds and central differences of the positions. */
export interface SpeedTolerance {
  /** Degrees per day. */
  longitude: number
  /** Degrees per day. */
  latitude: number
  /** AU per day. */
  distance: number
}

export interface ConformanceOptions {
  /**
   * Range the suite loads and samples. Must lie within the engine coverage and span at
   * least three years, so that every planet, Mars included, turns retrograde in it.
   */
  range: TimeRange
  /** Defaults to `DEFAULT_SPEED_TOLERANCE`. */
  speedTolerance?: SpeedTolerance
}

export const DEFAULT_SPEED_TOLERANCE: SpeedTolerance = {
  longitude: 1e-3,
  latitude: 1e-3,
  distance: 1e-6,
}

/** Shortest range that contains a retrograde period of every planet. */
const MINIMUM_RANGE_DAYS = 3 * 365.25

/** Number of instants sampled for shape and speed checks. */
const SAMPLE_COUNT = 60

/** Step of the central differences, in days. */
const DIFFERENCE_STEP = 0.01

const ALWAYS_DIRECT: ReadonlySet<Body> = new Set(['sun', 'moon'])

function at(julianDay: number): JulianDayTT {
  return julianDay as JulianDayTT
}

/** Evenly spaced instants strictly inside the range, leaving room for differences. */
function sampleInstants(range: TimeRange, count: number): JulianDayTT[] {
  const start = range.start + DIFFERENCE_STEP
  const span = range.end - DIFFERENCE_STEP - start
  return Array.from({ length: count }, (_, index) => at(start + (span * index) / (count - 1)))
}

/** Difference between two longitudes across the 360° → 0° wrap, in [−180, 180). */
function longitudeDifference(to: number, from: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

/**
 * Registers the conformance suite for an engine. Every adapter must pass it.
 *
 * `createEngine` must return a new, unloaded engine on each call.
 */
export function describeEngineConformance(
  name: string,
  createEngine: () => AstronomyEngine,
  options: ConformanceOptions,
): void {
  const { range } = options
  const tolerance = options.speedTolerance ?? DEFAULT_SPEED_TOLERANCE

  if (range.end - range.start < MINIMUM_RANGE_DAYS) {
    throw new Error(`Conformance range for ${name} must span at least three years.`)
  }

  describe(`${name} conforms to the engine contract`, () => {
    let engine: AstronomyEngine
    let bodies: Body[]

    beforeAll(async () => {
      engine = createEngine()
      bodies = BODIES.filter((body) => engine.bodies.has(body))
      await engine.load(range)
    })

    describe('info and bodies', () => {
      it('declares the adapter and its library', () => {
        const { id, name, version, license, source } = engine.info
        for (const field of [id, name, version, license, source]) {
          expect(field).toBeTypeOf('string')
          expect(field.length).toBeGreaterThan(0)
        }
      })

      it('declares a coverage that contains the test range', () => {
        const { coverage } = engine.info
        expect(Number.isFinite(coverage.start)).toBe(true)
        expect(Number.isFinite(coverage.end)).toBe(true)
        expect(coverage.start).toBeLessThan(coverage.end)
        expect(range.start).toBeGreaterThanOrEqual(coverage.start)
        expect(range.end).toBeLessThanOrEqual(coverage.end)
      })

      it('computes at least one body, all of them known', () => {
        expect(engine.bodies.size).toBeGreaterThan(0)
        for (const body of engine.bodies) {
          expect(BODIES).toContain(body)
        }
      })
    })

    describe('load()', () => {
      it('returns a promise and can be called again for a loaded range', async () => {
        const result = engine.load(range)
        expect(result).toBeInstanceOf(Promise)
        await expect(result).resolves.toBeUndefined()
        await expect(engine.load(range)).resolves.toBeUndefined()
      })

      it('rejects a range outside the coverage with OutOfRangeError', async () => {
        const { coverage } = engine.info
        const before = { start: at(coverage.start - 10), end: at(coverage.start - 1) }
        const across = { start: at(coverage.end - 1), end: at(coverage.end + 1) }

        await expect(createEngine().load(before)).rejects.toBeInstanceOf(OutOfRangeError)
        await expect(createEngine().load(across)).rejects.toBeInstanceOf(OutOfRangeError)
      })
    })

    describe('state() errors', () => {
      it('throws OutOfRangeError outside the coverage', () => {
        const { coverage } = engine.info
        const body = bodies[0] as Body
        expect(() => engine.state(body, at(coverage.start - 1))).toThrow(OutOfRangeError)
        expect(() => engine.state(body, at(coverage.end + 1))).toThrow(OutOfRangeError)
      })

      it('throws UnsupportedBodyError for a body it does not compute', (context) => {
        const unsupported = BODIES.filter((body) => !engine.bodies.has(body))
        if (unsupported.length === 0) {
          context.skip()
        }
        for (const body of unsupported) {
          expect(() => engine.state(body, range.start)).toThrow(UnsupportedBodyError)
        }
      })

      it('before load(), either answers or throws EngineNotReadyError', () => {
        const fresh = createEngine()
        const instant = at((range.start + range.end) / 2)
        for (const body of bodies) {
          let state: BodyState
          try {
            state = fresh.state(body, instant)
          } catch (error) {
            expect(error).toBeInstanceOf(EngineNotReadyError)
            continue
          }
          expectValidState(state, body)
        }
      })
    })

    describe('state() results', () => {
      it('answers at both ends of the loaded range', () => {
        for (const body of bodies) {
          expectValidState(engine.state(body, range.start), body)
          expectValidState(engine.state(body, range.end), body)
        }
      })

      it('returns valid, plain, synchronous and deterministic states', () => {
        for (const instant of sampleInstants(range, SAMPLE_COUNT)) {
          for (const body of bodies) {
            const state = engine.state(body, instant)
            expect(state).not.toBeInstanceOf(Promise)
            expectValidState(state, body)
            expect(Object.getPrototypeOf(state)).toBe(Object.prototype)
            expect(JSON.parse(JSON.stringify(state))).toEqual(state)
            expect(engine.state(body, instant)).toEqual(state)
          }
        }
      })

      it('reports speeds that match central differences of the positions', () => {
        for (const instant of sampleInstants(range, SAMPLE_COUNT)) {
          for (const body of bodies) {
            const state = engine.state(body, instant)
            const before = engine.state(body, at(instant - DIFFERENCE_STEP))
            const after = engine.state(body, at(instant + DIFFERENCE_STEP))
            const span = 2 * DIFFERENCE_STEP

            const longitudeSpeed = longitudeDifference(after.longitude, before.longitude) / span
            const latitudeSpeed = (after.latitude - before.latitude) / span
            const distanceSpeed = (after.distance - before.distance) / span

            const where = `${body} at JD ${instant} TT`
            expect(Math.abs(state.longitudeSpeed - longitudeSpeed), where).toBeLessThan(
              tolerance.longitude,
            )
            expect(Math.abs(state.latitudeSpeed - latitudeSpeed), where).toBeLessThan(
              tolerance.latitude,
            )
            expect(Math.abs(state.distanceSpeed - distanceSpeed), where).toBeLessThan(
              tolerance.distance,
            )
          }
        }
      })

      it('shows the Sun and Moon always direct and every planet retrograde at times', () => {
        for (const body of bodies) {
          let direct = false
          let retrograde = false
          for (let julianDay: number = range.start; julianDay <= range.end; julianDay += 1) {
            const { longitudeSpeed } = engine.state(body, at(julianDay))
            if (longitudeSpeed > 0) direct = true
            if (longitudeSpeed < 0) retrograde = true
          }
          expect(direct, `${body} moves direct`).toBe(true)
          expect(retrograde, `${body} turns retrograde`).toBe(!ALWAYS_DIRECT.has(body))
        }
      })
    })
  })
}

function expectValidState(state: BodyState, body: Body): void {
  expect(state.body).toBe(body)
  for (const field of [
    'longitude',
    'latitude',
    'distance',
    'longitudeSpeed',
    'latitudeSpeed',
    'distanceSpeed',
  ] as const) {
    expect(Number.isFinite(state[field]), `${body} ${field} is finite`).toBe(true)
  }
  expect(state.longitude).toBeGreaterThanOrEqual(0)
  expect(state.longitude).toBeLessThan(360)
  expect(Math.abs(state.latitude)).toBeLessThanOrEqual(90)
  expect(state.distance).toBeGreaterThan(0)
}
