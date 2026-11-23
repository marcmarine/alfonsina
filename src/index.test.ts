import { describe, expect, it } from 'vitest'
import * as alfonsina from './index.ts'

describe('alfonsina', () => {
  it('exposes the zodiac helpers', () => {
    expect(Object.keys(alfonsina).sort()).toEqual(['Alfonsina', 'findAspects', 'zodiac'])
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
})
