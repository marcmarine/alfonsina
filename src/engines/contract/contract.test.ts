import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  type AstronomyEngine,
  BODIES,
  type Body,
  type BodyState,
  type JulianDayTT,
  type JulianDayUT,
  type TimeRange,
} from './index.js'

describe('BODIES', () => {
  it('lists the ten bodies of 0.1.0 in traditional order, without repeats', () => {
    expect(BODIES).toEqual([
      'sun',
      'moon',
      'mercury',
      'venus',
      'mars',
      'jupiter',
      'saturn',
      'uranus',
      'neptune',
      'pluto',
    ])
  })

  it('is the source of the Body type', () => {
    expectTypeOf<(typeof BODIES)[number]>().toEqualTypeOf<Body>()
  })
})

describe('Julian Day types', () => {
  it('are plain numbers at runtime', () => {
    const julianDay = 2451545 as JulianDayTT
    expect(typeof julianDay).toBe('number')
    expect(julianDay + 1).toBe(2451546)
  })

  it('keep TT and UT apart at compile time', () => {
    const tt = 2451545 as JulianDayTT
    const ut = 2451545 as JulianDayUT

    // @ts-expect-error UT where TT is expected
    const notTT: JulianDayTT = ut
    // @ts-expect-error TT where UT is expected
    const notUT: JulianDayUT = tt
    // @ts-expect-error an unbranded number where TT is expected
    const plain: JulianDayTT = 2451545

    // Both still read as numbers.
    const asNumber: number = tt

    expect([notTT, notUT, plain, asNumber]).toHaveLength(4)
  })

  it('make both ends of a TimeRange TT', () => {
    expectTypeOf<TimeRange['start']>().toEqualTypeOf<JulianDayTT>()
    expectTypeOf<TimeRange['end']>().toEqualTypeOf<JulianDayTT>()
  })
})

describe('AstronomyEngine', () => {
  it('has only load() as async and state() as sync', () => {
    expectTypeOf<AstronomyEngine['load']>().returns.toEqualTypeOf<Promise<void>>()
    expectTypeOf<AstronomyEngine['state']>().returns.toEqualTypeOf<BodyState>()
    expectTypeOf<AstronomyEngine['state']>().parameter(1).toEqualTypeOf<JulianDayTT>()
  })

  it('rejects a UT Julian Day in state()', () => {
    const engine = {} as AstronomyEngine
    const call = () => {
      // @ts-expect-error state() takes TT, not UT
      engine.state('sun', 2451545 as JulianDayUT)
    }
    expect(call).toBeTypeOf('function')
  })
})
