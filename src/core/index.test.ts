import { describe, expect, it } from 'vitest'
import * as core from './index.ts'

describe('alfonsina/core', () => {
  it('exposes the time, degrees and aspects modules', () => {
    expect(Object.keys(core).sort()).toEqual(['aspects', 'degrees', 'time'])
    expect(core.time.fromUTC('2000-01-01T12:00:00Z').julianDayUT).toBe(2451545)
  })
})
