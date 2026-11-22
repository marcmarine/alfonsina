import { tablesFor } from 'naelos-ephemeris'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeEngineConformance } from '../../../tests/engine-conformance/suite.ts'
import {
  type Body,
  EngineNotReadyError,
  type JulianDayTT,
  OutOfRangeError,
  type TimeRange,
  UnsupportedBodyError,
} from '../contract/index.ts'
import {
  NAELOS_COVERAGE,
  type NaelosTableLoader,
  naelosEngine,
  readPackageTable,
} from './naelos.ts'

/** 2000-01-01 to 2003-01-01, 0h TT. */
const range: TimeRange = {
  start: 2451544.5 as JulianDayTT,
  end: 2452640.5 as JulianDayTT,
}

/** 1750-01-01 to 1751-01-01, 0h TT: a century the 2000–2003 range does not load. */
const eighteenthCentury: TimeRange = {
  start: 2360220.5 as JulianDayTT,
  end: 2360585.5 as JulianDayTT,
}

const KILOMETRES_PER_AU = 149597870.7

/** A loader that reads the package tables and records every file it is asked for. */
function recordingLoader(): { loader: NaelosTableLoader; requested: string[] } {
  const requested: string[] = []
  const loader: NaelosTableLoader = (name) => {
    requested.push(name)
    return readPackageTable(name)
  }
  return { loader, requested }
}

describeEngineConformance('naelos', () => naelosEngine(), { range })

describe('naelosEngine', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('declares naelos-ephemeris, its version and the DE440 coverage', () => {
    const { info, bodies } = naelosEngine()
    expect(info.id).toBe('naelos')
    expect(info.name).toBe('naelos-ephemeris')
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(info.license).toBe('Apache-2.0')
    expect(info.source).toBe('JPL DE440')
    expect(info.coverage).toBe(NAELOS_COVERAGE)
    expect(bodies.size).toBe(10)
  })

  it('covers 1551-01-01 to 2649-01-01, 0h TT, within the DE440 tables of the package', () => {
    expect(NAELOS_COVERAGE.start).toBe(2287550.5)
    expect(NAELOS_COVERAGE.end).toBe(2688587.5)
    expect(tablesFor(NAELOS_COVERAGE.start, NAELOS_COVERAGE.start)).toEqual(['ne-1550.bin'])
    expect(tablesFor(NAELOS_COVERAGE.end, NAELOS_COVERAGE.end)).toEqual(['ne-2600.bin'])
  })

  // Meeus, Astronomical Algorithms, example 47.a: the Moon on 1992-04-12 at 0h TD,
  // apparent λ = 133.167265°, β = −3.229126°, Δ = 368409.7 km, from his abridged series.
  // naelos uses JPL DE440, so they agree within the series' errors: a few arcseconds, and
  // about 30 km in distance.
  it('agrees with the apparent Moon of Meeus example 47.a', async () => {
    const engine = naelosEngine()
    const instant = 2448724.5 as JulianDayTT
    await engine.load({ start: instant, end: instant })
    const moon = engine.state('moon', instant)
    expect(Math.abs(moon.longitude - 133.167265) * 3600).toBeLessThan(5)
    expect(Math.abs(moon.latitude - -3.229126) * 3600).toBeLessThan(5)
    expect(Math.abs(moon.distance * KILOMETRES_PER_AU - 368409.7)).toBeLessThan(50)
  })

  it('throws EngineNotReadyError before load()', () => {
    expect(() => naelosEngine().state('sun', range.start)).toThrow(EngineNotReadyError)
  })

  it('throws EngineNotReadyError for a century that has not been loaded', async () => {
    const engine = naelosEngine()
    await engine.load(range)
    expect(() => engine.state('mars', eighteenthCentury.start)).toThrow(EngineNotReadyError)
    await engine.load(eighteenthCentury)
    expect(() => engine.state('mars', eighteenthCentury.start)).not.toThrow()
    expect(() => engine.state('mars', range.start)).not.toThrow()
  })

  it('loads the tables a range needs, once each, even when loads overlap', async () => {
    const { loader, requested } = recordingLoader()
    const engine = naelosEngine({ tables: loader })
    await Promise.all([engine.load(range), engine.load(range)])
    await engine.load(range)
    expect(requested.sort()).toEqual(tablesFor(range.start, range.end).sort())
  })

  it('checks the coverage before loading anything', async () => {
    const { loader, requested } = recordingLoader()
    const engine = naelosEngine({ tables: loader })
    const across = { start: NAELOS_COVERAGE.start, end: (NAELOS_COVERAGE.end + 1) as JulianDayTT }
    await expect(engine.load(across)).rejects.toBeInstanceOf(OutOfRangeError)
    expect(requested).toEqual([])
  })

  it("passes on the loader's error and lets a later load() retry the file", async () => {
    let fail = true
    const engine = naelosEngine({
      tables: (name) => (fail ? Promise.reject(new Error(`404 ${name}`)) : readPackageTable(name)),
    })
    await expect(engine.load(range)).rejects.toThrow('404 ne-')
    fail = false
    await expect(engine.load(range)).resolves.toBeUndefined()
    expect(() => engine.state('sun', range.start)).not.toThrow()
  })

  it('accepts tables as an ArrayBuffer as well as a Uint8Array', async () => {
    const engine = naelosEngine({
      tables: async (name) => {
        const bytes = await readPackageTable(name)
        return bytes instanceof Uint8Array ? bytes.slice().buffer : bytes
      },
    })
    await engine.load(range)
    expect(() => engine.state('moon', range.end)).not.toThrow()
  })

  it('requires the tables option outside Node, Bun and Deno', () => {
    vi.stubGlobal('process', undefined)
    expect(() => naelosEngine()).toThrow('needs the `tables` option')
    expect(() => naelosEngine({ tables: readPackageTable })).not.toThrow()
  })

  it('throws OutOfRangeError outside the coverage, even before load()', () => {
    const engine = naelosEngine()
    const { start, end } = NAELOS_COVERAGE
    expect(() => engine.state('sun', (start - 1) as JulianDayTT)).toThrow(OutOfRangeError)
    expect(() => engine.state('sun', (end + 1) as JulianDayTT)).toThrow(OutOfRangeError)
    expect(() => engine.state('sun', Number.NaN as JulianDayTT)).toThrow(OutOfRangeError)
  })

  it('answers at both ends of the coverage', async () => {
    const engine = naelosEngine()
    const { start, end } = NAELOS_COVERAGE
    await engine.load({ start, end: start })
    await engine.load({ start: end, end })
    for (const body of ['sun', 'moon', 'pluto'] as const) {
      expect(() => engine.state(body, start)).not.toThrow()
      expect(() => engine.state(body, end)).not.toThrow()
    }
  })

  it('refuses bodies naelos knows but the contract does not, such as Chiron', async () => {
    const engine = naelosEngine()
    await engine.load(range)
    expect(() => engine.state('chiron' as Body, range.start)).toThrow(UnsupportedBodyError)
  })
})
