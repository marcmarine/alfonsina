import { describe, expect, it } from 'vitest'
import * as core from './core/index.ts'
import * as contract from './engines/contract/index.ts'
import * as alfonsina from './index.ts'

describe('alfonsina', () => {
  it('exposes the API, the astrology helpers and the error classes', () => {
    expect(Object.keys(alfonsina).sort()).toEqual([
      'Alfonsina',
      'EngineError',
      'EngineNotReadyError',
      'InvalidDateError',
      'InvalidTimeZoneError',
      'NoSunriseError',
      'OutOfRangeError',
      'UnsupportedBodyError',
      'findAspects',
      'zodiac',
    ])
    expect(Object.keys(alfonsina.zodiac).sort()).toEqual([
      'signLongitude',
      'signLongitudeParts',
      'signOf',
    ])
    expect(alfonsina.zodiac.signOf(54.45)).toBe('taurus')
  })

  it('exposes findAspects', () => {
    const aspects = alfonsina.findAspects({ sun: { longitude: 0 } }, { moon: { longitude: 120 } })
    expect(aspects.map((aspect) => aspect.aspect)).toEqual(['trine'])
  })

  it('exposes the same error classes the layers below throw', () => {
    expect(alfonsina.EngineError).toBe(contract.EngineError)
    expect(alfonsina.EngineNotReadyError).toBe(contract.EngineNotReadyError)
    expect(alfonsina.OutOfRangeError).toBe(contract.OutOfRangeError)
    expect(alfonsina.UnsupportedBodyError).toBe(contract.UnsupportedBodyError)
    expect(alfonsina.InvalidDateError).toBe(core.time.InvalidDateError)
    expect(alfonsina.InvalidTimeZoneError).toBe(core.time.InvalidTimeZoneError)
  })
})
