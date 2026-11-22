import { describe, expect, it } from 'vitest'
import { describeEngineConformance } from '../../../tests/engine-conformance/suite.ts'
import {
  type Body,
  type JulianDayTT,
  OutOfRangeError,
  type TimeRange,
  UnsupportedBodyError,
} from '../contract/index.ts'
import { CAELUS_COVERAGE, caelusEngine } from './caelus.ts'

/** 2000-01-01 to 2003-01-01, 0h TT. */
const range: TimeRange = {
  start: 2451544.5 as JulianDayTT,
  end: 2452640.5 as JulianDayTT,
}

const KILOMETRES_PER_AU = 149597870.7

describeEngineConformance('caelus', () => caelusEngine(), { range })

describe('caelusEngine', () => {
  it('declares caelus, its version and the coverage bounded by Pluto', () => {
    const { info, bodies } = caelusEngine()
    expect(info.id).toBe('caelus')
    expect(info.name).toBe('caelus')
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(info.license).toBe('MIT')
    expect(info.coverage).toBe(CAELUS_COVERAGE)
    expect(bodies.size).toBe(10)
  })

  it('covers 1885-01-01 to 2100-01-01, 0h TT', () => {
    expect(CAELUS_COVERAGE.start).toBe(2409542.5)
    expect(CAELUS_COVERAGE.end).toBe(2488069.5)
  })

  // Meeus, Astronomical Algorithms, example 47.a: the Moon on 1992-04-12 at 0h TD,
  // apparent λ = 133.167265°, β = −3.229126°, Δ = 368409.7 km. caelus implements the same
  // series, so it checks the units and the TT instant the adapter passes through.
  it('reproduces the apparent Moon of Meeus example 47.a', () => {
    const moon = caelusEngine().state('moon', 2448724.5 as JulianDayTT)
    expect(moon.longitude).toBeCloseTo(133.167265, 5)
    expect(moon.latitude).toBeCloseTo(-3.229126, 5)
    expect(moon.distance * KILOMETRES_PER_AU).toBeCloseTo(368409.7, 0)
  })

  it('answers before load(), since its data is embedded', () => {
    expect(() => caelusEngine().state('sun', range.start)).not.toThrow()
  })

  it('answers at both ends of the coverage and throws just outside', () => {
    const engine = caelusEngine()
    const { start, end } = CAELUS_COVERAGE
    for (const body of ['sun', 'moon', 'pluto'] as const) {
      expect(() => engine.state(body, start)).not.toThrow()
      expect(() => engine.state(body, end)).not.toThrow()
      expect(() => engine.state(body, (start - 0.001) as JulianDayTT)).toThrow(OutOfRangeError)
      expect(() => engine.state(body, (end + 0.001) as JulianDayTT)).toThrow(OutOfRangeError)
    }
  })

  it('throws OutOfRangeError for a Julian Day that is not a number', () => {
    expect(() => caelusEngine().state('sun', Number.NaN as JulianDayTT)).toThrow(OutOfRangeError)
  })

  it('loads the whole coverage and rejects a range that leaves it', async () => {
    const engine = caelusEngine()
    await expect(engine.load(CAELUS_COVERAGE)).resolves.toBeUndefined()
    const across = { start: CAELUS_COVERAGE.start, end: (CAELUS_COVERAGE.end + 1) as JulianDayTT }
    await expect(engine.load(across)).rejects.toBeInstanceOf(OutOfRangeError)
  })

  it('refuses bodies caelus knows but the contract does not, such as Chiron', () => {
    const engine = caelusEngine()
    expect(() => engine.state('chiron' as Body, range.start)).toThrow(UnsupportedBodyError)
  })

  it('keeps longitudes in [0, 360) and their speeds continuous across 0° Aries', () => {
    // The Sun crosses 0° Aries at the March equinox, around 2001-03-20 13:31 UT.
    const engine = caelusEngine()
    for (let julianDay = 2451988.5; julianDay <= 2451990.5; julianDay += 0.05) {
      const sun = engine.state('sun', julianDay as JulianDayTT)
      expect(sun.longitude).toBeGreaterThanOrEqual(0)
      expect(sun.longitude).toBeLessThan(360)
      expect(sun.longitudeSpeed).toBeCloseTo(0.99, 1)
    }
  })
})
