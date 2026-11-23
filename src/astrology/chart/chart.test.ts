import { describe, expect, it } from 'vitest'
import { createFakeEngine } from '../../../tests/engine-conformance/fake-engine.ts'
import { fromUTC } from '../../core/time/index.ts'
import { BODIES } from '../../engines/contract/index.ts'
import { aspectsWithin } from '../aspects/index.ts'
import { ANGLES, houseOf } from '../houses/index.ts'
import { signLongitude, signOf } from '../zodiac/index.ts'
import { type ChartSettings, calculateChart } from './chart.ts'

const engine = createFakeEngine()
await engine.load({
  start: fromUTC('1900-01-01').julianDayTT,
  end: fromUTC('2100-01-01').julianDayTT,
})
const state = engine.state.bind(engine)
const MADRID = { latitude: 40.4168, longitude: -3.7038 }
const instant = fromUTC('1990-05-15T12:30:00Z')

function chartAt(utc: string, settings?: ChartSettings, coordinates = MADRID) {
  return calculateChart(state, fromUTC(utc), coordinates, settings)
}

describe('calculateChart', () => {
  it('holds the bodies in traditional order, then the angles', () => {
    const { points } = calculateChart(state, instant, MADRID)
    expect(Object.keys(points)).toEqual([...BODIES, ...ANGLES])
  })

  it('places each body with its engine state, sign and house', () => {
    const { points, houses } = calculateChart(state, instant, MADRID)
    for (const body of BODIES) {
      const expected = engine.state(body, instant.julianDayTT)
      expect(points[body]).toEqual({
        kind: 'body',
        body,
        longitude: expected.longitude,
        latitude: expected.latitude,
        longitudeSpeed: expected.longitudeSpeed,
        retrograde: expected.longitudeSpeed < 0,
        sign: signOf(expected.longitude),
        signLongitude: signLongitude(expected.longitude),
        house: houseOf(expected.longitude, houses.cusps),
      })
    }
  })

  it('marks a body retrograde exactly while its speed is negative', () => {
    const seen = new Set<boolean>()
    for (let month = 1; month <= 12; month += 1) {
      for (const year of [1990, 1991]) {
        const utc = `${year}-${String(month).padStart(2, '0')}-01`
        const { mars } = chartAt(utc).points
        expect(mars.retrograde, utc).toBe(mars.longitudeSpeed < 0)
        seen.add(mars.retrograde)
      }
    }
    expect(seen).toEqual(new Set([true, false]))
  })

  it('puts the angles on the house cusps and keeps them free of speed and house', () => {
    const { points, houses } = calculateChart(state, instant, MADRID)
    expect(points.ascendant.longitude).toBe(houses.cusps[0])
    expect(points.imumCoeli.longitude).toBe(houses.cusps[3])
    expect(points.descendant.longitude).toBe(houses.cusps[6])
    expect(points.mediumCoeli.longitude).toBe(houses.cusps[9])
    expect(Object.keys(points.ascendant).sort()).toEqual([
      'angle',
      'kind',
      'longitude',
      'sign',
      'signLongitude',
    ])
  })

  it('uses Placidus by default and whole-sign houses when asked', () => {
    expect(calculateChart(state, instant, MADRID).houses.system).toBe('placidus')
    const { houses } = chartAt('1990-05-15T12:30:00Z', { houseSystem: 'whole-sign' })
    expect(houses.system).toBe('whole-sign')
    expect((houses.cusps[0] as number) % 30).toBe(0)
  })

  it('falls back to whole-sign houses with a warning beyond the polar circles', () => {
    const { houses, warnings } = chartAt(
      '1990-05-15T12:30:00Z',
      {},
      {
        latitude: 78.22,
        longitude: 15.65,
      },
    )
    expect(houses.system).toBe('whole-sign')
    expect(warnings.map((warning) => warning.code)).toEqual(['PLACIDUS_UNDEFINED'])
  })

  it('finds the aspects within the chart, with the settings given', () => {
    const { points, aspects } = calculateChart(state, instant, MADRID)
    expect(aspects).toEqual(aspectsWithin(points))
    expect(chartAt('1990-05-15T12:30:00Z', { aspects: [] }).aspects).toEqual([])
    const wide = chartAt('1990-05-15T12:30:00Z', { orbs: { conjunction: 12 } })
    expect(wide.aspects).toEqual(aspectsWithin(wide.points, { orbs: { conjunction: 12 } }))
  })

  it('returns plain data', () => {
    const result = calculateChart(state, instant, MADRID)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it.each([
    ['a latitude past the pole', { latitude: 90.5, longitude: 0 }, {}],
    ['a longitude past 180°', { latitude: 0, longitude: 181 }, {}],
    ['a latitude that is not a number', { latitude: Number.NaN, longitude: 0 }, {}],
    ['a zodiac other than tropical', MADRID, { zodiac: 'sidereal' }],
    ['an unknown house system', MADRID, { houseSystem: 'koch' }],
  ])('rejects %s', (_, coordinates, settings) => {
    expect(() => calculateChart(state, instant, coordinates, settings as ChartSettings)).toThrow(
      RangeError,
    )
  })
})
