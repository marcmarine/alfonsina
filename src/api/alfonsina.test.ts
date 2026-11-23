import { describe, expect, it, vi } from 'vitest'
import { createFakeEngine } from '../../tests/engine-conformance/fake-engine.ts'
import { caelusEngine } from '../engines/caelus/index.ts'
import {
  type AstronomyEngine,
  EngineNotReadyError,
  type JulianDayTT,
  OutOfRangeError,
  type TimeRange,
  UnsupportedBodyError,
} from '../engines/contract/index.ts'
import { Alfonsina } from './alfonsina.ts'

/** 1950-01-01 and 2050-01-01, 0h TT. */
const JD_1950 = 2433282.5 as JulianDayTT
const JD_2050 = 2469807.5 as JulianDayTT
/** 1850-01-01 and 1875-01-01, 0h TT. */
const JD_1850 = 2396758.5 as JulianDayTT
const JD_1875 = 2405889.5 as JulianDayTT

/** A fake engine whose `load` calls are recorded. */
function spiedEngine(coverage?: TimeRange): AstronomyEngine & { loads: TimeRange[] } {
  const engine = createFakeEngine(coverage ? { coverage } : {})
  const loads: TimeRange[] = []
  return {
    ...engine,
    loads,
    load: async (range) => {
      loads.push(range)
      await engine.load(range)
    },
  }
}

describe('Alfonsina.create', () => {
  it('loads 1900–2100 by default', async () => {
    const engine = spiedEngine()
    const alfonsina = await Alfonsina.create({ engine })
    expect(engine.loads).toHaveLength(1)
    expect(engine.loads[0]?.start).toBeCloseTo(2415020.5, 3)
    expect(engine.loads[0]?.end).toBeCloseTo(2488069.5, 2)
    expect(alfonsina.engine.state('sun', JD_1950).body).toBe('sun')
    expect(alfonsina.engine.state('moon', JD_2050).body).toBe('moon')
  })

  it('cuts the default range to the engine coverage', async () => {
    const coverage = { start: JD_1950, end: JD_2050 }
    const engine = spiedEngine(coverage)
    await Alfonsina.create({ engine })
    expect(engine.loads).toEqual([coverage])
  })

  it('works with caelus and no range, though 2100 UTC is past its coverage in TT', async () => {
    const alfonsina = await Alfonsina.create({ engine: caelusEngine() })
    expect(alfonsina.engine.info.id).toBe('caelus')
    expect(alfonsina.engine.state('mars', JD_1950).longitude).toBeTypeOf('number')
  })

  it('loads the range asked for, and only that', async () => {
    const engine = spiedEngine()
    const alfonsina = await Alfonsina.create({
      engine,
      range: { start: '1850-01-01', end: '1875-01-01' },
    })
    expect(engine.loads).toHaveLength(1)
    expect(alfonsina.engine.state('sun', (JD_1850 + 1) as JulianDayTT).body).toBe('sun')
    expect(() => alfonsina.engine.state('sun', JD_1950)).toThrow(EngineNotReadyError)
  })

  it('rejects a range outside the engine coverage', async () => {
    await expect(
      Alfonsina.create({
        engine: createFakeEngine(),
        range: { start: '1600-01-01', end: '1700-01-01' },
      }),
    ).rejects.toThrow(OutOfRangeError)
  })
})

describe('alfonsina.load', () => {
  it('adds a range to the loaded ones', async () => {
    const alfonsina = await Alfonsina.create({ engine: createFakeEngine() })
    expect(() => alfonsina.engine.state('sun', JD_1875)).toThrow(EngineNotReadyError)
    await alfonsina.load({ start: '1850-01-01', end: '1880-01-01' })
    expect(alfonsina.engine.state('sun', JD_1875).body).toBe('sun')
    expect(alfonsina.engine.state('sun', JD_1950).body).toBe('sun')
  })

  it('returns at once, without calling the engine, for a range already loaded', async () => {
    const engine = spiedEngine()
    const alfonsina = await Alfonsina.create({ engine })
    await alfonsina.load({ start: '1950-01-01', end: '2050-01-01' })
    expect(engine.loads).toHaveLength(1)
  })

  it('merges overlapping ranges, so a range spanning both is loaded already', async () => {
    const engine = spiedEngine()
    const alfonsina = await Alfonsina.create({
      engine,
      range: { start: '1800-01-01', end: '1900-01-01' },
    })
    await alfonsina.load({ start: '1850-01-01', end: '1950-01-01' })
    await alfonsina.load({ start: '1820-01-01', end: '1940-01-01' })
    expect(engine.loads).toHaveLength(2)
  })

  it('keeps the loaded ranges when the engine fails to load', async () => {
    const alfonsina = await Alfonsina.create({ engine: createFakeEngine() })
    await expect(alfonsina.load({ start: '1500-01-01', end: '1600-01-01' })).rejects.toThrow(
      OutOfRangeError,
    )
    expect(alfonsina.engine.state('sun', JD_1950).body).toBe('sun')
  })
})

describe('an instance', () => {
  it('is plain: its functions work detached from it', async () => {
    const { engine, load } = await Alfonsina.create({ engine: createFakeEngine() })
    await load({ start: '1850-01-01', end: '1880-01-01' })
    expect(engine.state('sun', JD_1875).body).toBe('sun')
  })
})

describe('alfonsina.engine', () => {
  it('exposes the engine info and bodies, but not load', async () => {
    const engine = createFakeEngine({ bodies: ['sun', 'moon'] })
    const alfonsina = await Alfonsina.create({ engine })
    expect(alfonsina.engine.info).toBe(engine.info)
    expect(alfonsina.engine.bodies).toBe(engine.bodies)
    expect('load' in alfonsina.engine).toBe(false)
  })

  it('checks the instance loaded ranges even when the engine could answer', async () => {
    // caelus answers anywhere in its coverage; the instance still asks for load().
    const alfonsina = await Alfonsina.create({
      engine: caelusEngine(),
      range: { start: '1950-01-01', end: '1960-01-01' },
    })
    const error = (() => {
      try {
        alfonsina.engine.state('sun', JD_2050)
      } catch (caught) {
        return caught
      }
    })()
    expect(error).toBeInstanceOf(EngineNotReadyError)
    expect(error).toMatchObject({ engineId: 'caelus', requested: JD_2050 })
    expect((error as EngineNotReadyError).suggestion).toContain('alfonsina.load(')
  })

  it('leaves unsupported bodies and instants outside the coverage to the engine errors', async () => {
    const alfonsina = await Alfonsina.create({ engine: createFakeEngine({ bodies: ['sun'] }) })
    expect(() => alfonsina.engine.state('moon', JD_1950)).toThrow(UnsupportedBodyError)
    expect(() => alfonsina.engine.state('sun', 2_600_000 as JulianDayTT)).toThrow(OutOfRangeError)
  })

  it('passes the call to the engine once the instant is loaded', async () => {
    const engine = createFakeEngine()
    const spy = vi.spyOn(engine, 'state')
    const alfonsina = await Alfonsina.create({ engine })
    expect(alfonsina.engine.state('venus', JD_1950)).toEqual(engine.state('venus', JD_1950))
    expect(spy).toHaveBeenCalledWith('venus', JD_1950)
  })
})
