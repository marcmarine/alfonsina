import { describe, expect, it } from 'vitest'
import {
  EngineError,
  EngineNotReadyError,
  type JulianDayTT,
  OutOfRangeError,
  type TimeRange,
  UnsupportedBodyError,
} from './index.ts'

const coverage: TimeRange = {
  start: 2415020.5 as JulianDayTT,
  end: 2488069.5 as JulianDayTT,
}

describe('OutOfRangeError', () => {
  it('describes an instant outside the coverage', () => {
    const error = new OutOfRangeError('fake', 2500000 as JulianDayTT, coverage)

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(EngineError)
    expect(error.name).toBe('OutOfRangeError')
    expect(error.code).toBe('OUT_OF_RANGE')
    expect(error.engineId).toBe('fake')
    expect(error.requested).toBe(2500000)
    expect(error.coverage).toBe(coverage)
    expect(error.message).toBe(
      "Engine 'fake' cannot compute JD 2500000 TT: outside its coverage, JD 2415020.5–2488069.5 TT.",
    )
    expect(error.suggestion).not.toBe('')
  })

  it('describes a range outside the coverage', () => {
    const requested: TimeRange = {
      start: 2400000.5 as JulianDayTT,
      end: 2420000.5 as JulianDayTT,
    }
    const error = new OutOfRangeError('fake', requested, coverage)

    expect(error.requested).toBe(requested)
    expect(error.message).toContain('JD 2400000.5–2420000.5 TT')
  })
})

describe('UnsupportedBodyError', () => {
  it('names the body', () => {
    const error = new UnsupportedBodyError('fake', 'pluto')

    expect(error).toBeInstanceOf(EngineError)
    expect(error.name).toBe('UnsupportedBodyError')
    expect(error.code).toBe('UNSUPPORTED_BODY')
    expect(error.body).toBe('pluto')
    expect(error.message).toBe("Engine 'fake' does not compute 'pluto'.")
    expect(error.suggestion).not.toBe('')
  })
})

describe('EngineNotReadyError', () => {
  it('names the instant and points to load()', () => {
    const error = new EngineNotReadyError('fake', 2451545 as JulianDayTT)

    expect(error).toBeInstanceOf(EngineError)
    expect(error.name).toBe('EngineNotReadyError')
    expect(error.code).toBe('ENGINE_NOT_READY')
    expect(error.requested).toBe(2451545)
    expect(error.message).toBe("Engine 'fake' has no data loaded for JD 2451545 TT.")
    expect(error.suggestion).toContain('load()')
  })

  it('takes a suggestion from a caller that knows a better fix', () => {
    const error = new EngineNotReadyError('fake', 2451545 as JulianDayTT, 'Load it first.')
    expect(error.suggestion).toBe('Load it first.')
  })
})

describe('EngineError', () => {
  it('lets callers tell the errors apart by code', () => {
    const errors: EngineError[] = [
      new OutOfRangeError('fake', 0 as JulianDayTT, coverage),
      new UnsupportedBodyError('fake', 'moon'),
      new EngineNotReadyError('fake', 0 as JulianDayTT),
    ]

    expect(errors.map((error) => error.code)).toEqual([
      'OUT_OF_RANGE',
      'UNSUPPORTED_BODY',
      'ENGINE_NOT_READY',
    ])
  })
})
