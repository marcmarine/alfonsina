import { describe, expect, it } from 'vitest'
import * as alfonsina from './index.ts'

describe('alfonsina', () => {
  it('exposes the zodiac helpers', () => {
    expect(Object.keys(alfonsina)).toEqual(['zodiac'])
    expect(Object.keys(alfonsina.zodiac).sort()).toEqual([
      'signLongitude',
      'signLongitudeParts',
      'signOf',
    ])
    expect(alfonsina.zodiac.signOf(54.45)).toBe('taurus')
  })
})
