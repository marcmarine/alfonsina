import { beforeAll, describe, expect, it } from 'vitest'
import { createFakeEngine } from '../../tests/engine-conformance/fake-engine.ts'
import { NoSunriseError } from '../astrology/chart/index.ts'
import { deltaT } from '../core/time/index.ts'
import { caelusEngine } from '../engines/caelus/index.ts'
import { EngineNotReadyError } from '../engines/contract/index.ts'
import { naelosEngine } from '../engines/naelos/index.ts'
import { Alfonsina } from './alfonsina.ts'
import type { ChartInput } from './chart.ts'

const MADRID: ChartInput = {
  date: '1990-05-15',
  time: '14:30',
  location: { latitude: 40.4168, longitude: -3.7038, timezone: 'Europe/Madrid' },
}

let alfonsina: Alfonsina

beforeAll(async () => {
  alfonsina = await Alfonsina.create({ engine: caelusEngine() })
})

describe('alfonsina.chart', () => {
  it('casts the chart for a local time and place', () => {
    const chart = alfonsina.chart(MADRID)
    expect(chart.instant).toMatchObject({
      utc: '1990-05-15T12:30:00Z',
      local: '1990-05-15T14:30:00+02:00',
    })
    expect(chart.location).toEqual({ latitude: 40.4168, longitude: -3.7038 })
    expect(chart.points.sun).toMatchObject({ sign: 'taurus', house: 9, retrograde: false })
    expect(chart.points.sun.signLongitude).toBeCloseTo(24.42, 2)
    expect(chart.points.moon).toMatchObject({ sign: 'capricorn', house: 5 })
    expect(chart.points.mars).toMatchObject({ sign: 'pisces', house: 7 })
    expect(chart.points.ascendant).toMatchObject({ kind: 'angle', sign: 'virgo' })
    expect(chart.houses.system).toBe('placidus')
    expect(chart.aspects).toContainEqual(
      expect.objectContaining({ between: ['sun', 'moon'], aspect: 'trine', applying: false }),
    )
    expect(chart.warnings).toEqual([])
  })

  it('carries meta: engine, ΔT, positions, frame, zodiac and house system', () => {
    const { meta, instant } = alfonsina.chart(MADRID)
    expect(meta).toEqual({
      engine: alfonsina.engine.info,
      timeSource: 'given',
      deltaT: deltaT(instant.julianDayUT),
      positions: 'apparent',
      frame: 'ecliptic-of-date',
      zodiac: 'tropical',
      houseSystem: 'placidus',
    })
    expect(meta.engine).not.toBe(alfonsina.engine.info)
    expect((instant.julianDayTT - instant.julianDayUT) * 86400).toBeCloseTo(meta.deltaT, 3)
  })

  it('takes a UTC offset instead of a time zone', () => {
    const { location, ...rest } = MADRID
    const chart = alfonsina.chart({
      ...rest,
      location: { latitude: location.latitude, longitude: location.longitude, utcOffset: '+02:00' },
    })
    expect(chart.points).toEqual(alfonsina.chart(MADRID).points)
  })

  it('applies the settings and reports the house system asked for in meta', () => {
    const chart = alfonsina.chart({
      ...MADRID,
      location: { latitude: 78.22, longitude: 15.65, timezone: 'Arctic/Longyearbyen' },
      settings: { aspects: ['conjunction'], orbs: { conjunction: 10 } },
    })
    expect(chart.houses.system).toBe('whole-sign')
    expect(chart.meta.houseSystem).toBe('placidus')
    expect(chart.warnings.map((warning) => warning.code)).toEqual(['PLACIDUS_UNDEFINED'])
    expect(chart.aspects.every((aspect) => aspect.aspect === 'conjunction')).toBe(true)
  })

  it('warns about an ambiguous local time before the other warnings', () => {
    // Madrid's clock at Svalbard's latitude: one input that triggers both warnings.
    const chart = alfonsina.chart({
      date: '2021-10-31',
      time: '02:30',
      location: { latitude: 78.22, longitude: 15.65, timezone: 'Europe/Madrid' },
    })
    expect(chart.warnings.map((warning) => warning.code)).toEqual([
      'AMBIGUOUS_LOCAL_TIME',
      'PLACIDUS_UNDEFINED',
    ])
  })

  it('warns when ΔT is extrapolated', () => {
    const chart = alfonsina.chart({ ...MADRID, date: '2090-05-15' })
    const [warning] = chart.warnings
    expect(warning?.code).toBe('DELTA_T_EXTRAPOLATED')
    expect(warning?.message).toContain('2090-05-15T12:30:00Z')
  })

  it('throws EngineNotReadyError outside the loaded dates', async () => {
    const narrow = await Alfonsina.create({
      engine: createFakeEngine(),
      range: { start: '2000-01-01', end: '2001-01-01' },
    })
    expect(() => narrow.chart(MADRID)).toThrow(EngineNotReadyError)
  })

  it('rejects bad coordinates before reading the time', () => {
    expect(() => alfonsina.chart({ ...MADRID, location: { latitude: 95, longitude: 0 } })).toThrow(
      RangeError,
    )
  })

  it('returns plain data that survives JSON', () => {
    const chart = alfonsina.chart(MADRID)
    expect(JSON.parse(JSON.stringify(chart))).toEqual(chart)
  })

  it('gives the same houses and signs with another engine', async () => {
    const precise = await Alfonsina.create({
      engine: naelosEngine(),
      range: { start: '1990-01-01', end: '1991-01-01' },
    })
    const quick = alfonsina.chart(MADRID)
    const chart = precise.chart(MADRID)
    expect(chart.houses).toEqual(quick.houses)
    for (const point of Object.keys(chart.points) as (keyof typeof chart.points)[]) {
      expect(chart.points[point].sign, point).toBe(quick.points[point].sign)
    }
    // caelus is within a few arcseconds of naelos.
    expect(Math.abs(chart.points.moon.longitude - quick.points.moon.longitude) * 3600).toBeLessThan(
      10,
    )
  })
})

describe('alfonsina.chart at sunrise', () => {
  const SUNRISE: ChartInput = { ...MADRID, time: 'sunrise' }

  it('casts the chart for the local sunrise, marked as computed', () => {
    const chart = alfonsina.chart(SUNRISE)
    expect(chart.instant.local).toBe('1990-05-15T07:03:41+02:00')
    expect(chart.meta.timeSource).toBe('sunrise')
    expect(chart.points.sun.sign).toBe(chart.points.ascendant.sign)
    expect(chart.warnings.map((warning) => warning.code)).toEqual(['SUNRISE_CHART'])
  })

  it('is the same chart as asking for that time, apart from meta and warnings', () => {
    const sunrise = alfonsina.chart(SUNRISE)
    const given = alfonsina.chart({ ...MADRID, time: '07:03:41' })
    expect(sunrise.instant).toEqual(given.instant)
    expect(sunrise.points).toEqual(given.points)
    expect(sunrise.houses).toEqual(given.houses)
    expect(sunrise.aspects).toEqual(given.aspects)
    expect(given.meta.timeSource).toBe('given')
  })

  it('keeps the house system asked for and its fallback', () => {
    const chart = alfonsina.chart({
      ...SUNRISE,
      date: '1990-06-10',
      location: { latitude: 66.8, longitude: 18.96, utcOffset: '+02:00' },
    })
    expect(chart.houses.system).toBe('whole-sign')
    expect(chart.warnings.map((warning) => warning.code)).toEqual([
      'SUNRISE_CHART',
      'PLACIDUS_UNDEFINED',
    ])
  })

  it('throws NoSunriseError when the Sun does not rise that day', () => {
    expect(() =>
      alfonsina.chart({
        ...SUNRISE,
        date: '1990-06-21',
        location: { latitude: 78.22, longitude: 15.65, timezone: 'Arctic/Longyearbyen' },
      }),
    ).toThrow(NoSunriseError)
  })
})
