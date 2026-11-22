import { describe, expect, it } from 'vitest'
import {
  EngineNotReadyError,
  type JulianDayTT,
  OutOfRangeError,
  type TimeRange,
} from '../../src/engines/contract/index.ts'
import { createFakeEngine, FAKE_COVERAGE } from './fake-engine.ts'
import { describeEngineConformance } from './suite.ts'

/** 2000-01-01 to 2003-01-01, 0h TT. */
const range: TimeRange = {
  start: 2451544.5 as JulianDayTT,
  end: 2452640.5 as JulianDayTT,
}

describeEngineConformance('fake engine', () => createFakeEngine(), { range })

describeEngineConformance(
  'fake engine with some bodies',
  () => createFakeEngine({ bodies: ['sun', 'moon', 'mars'] }),
  { range },
)

describe('fake engine', () => {
  it('throws EngineNotReadyError before load()', () => {
    const engine = createFakeEngine()
    expect(() => engine.state('sun', range.start)).toThrow(EngineNotReadyError)
  })

  it('throws EngineNotReadyError for an instant outside every loaded range', async () => {
    const engine = createFakeEngine()
    await engine.load(range)
    expect(() => engine.state('sun', (range.end + 1) as JulianDayTT)).toThrow(EngineNotReadyError)
  })

  it('answers in every range it has loaded', async () => {
    const engine = createFakeEngine()
    const later = { start: 2460000.5 as JulianDayTT, end: 2460010.5 as JulianDayTT }
    await engine.load(range)
    await engine.load(later)
    expect(() => engine.state('moon', range.start)).not.toThrow()
    expect(() => engine.state('moon', later.end)).not.toThrow()
  })

  it('uses the given coverage', async () => {
    const coverage = { start: 2451544.5 as JulianDayTT, end: 2455000.5 as JulianDayTT }
    const engine = createFakeEngine({ coverage })
    expect(engine.info.coverage).toBe(coverage)
    await expect(engine.load({ start: coverage.start, end: FAKE_COVERAGE.end })).rejects.toThrow(
      OutOfRangeError,
    )
  })

  it('checks the body before the instant', () => {
    const engine = createFakeEngine({ bodies: ['sun'] })
    expect(() => engine.state('moon', 0 as JulianDayTT)).toThrow("does not compute 'moon'")
  })

  it('checks the coverage before the loaded ranges', () => {
    const engine = createFakeEngine()
    expect(() => engine.state('sun', (FAKE_COVERAGE.end + 1) as JulianDayTT)).toThrow(
      OutOfRangeError,
    )
  })
})
