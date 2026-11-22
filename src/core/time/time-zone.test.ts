import { describe, expect, it } from 'vitest'
import { InvalidDateError, InvalidTimeZoneError } from './errors.ts'
import { fromUTC } from './scales.ts'
import { fromLocal } from './time-zone.ts'

describe('fromLocal with a time zone', () => {
  it('reads an ordinary local time', () => {
    const { instant, warnings } = fromLocal({
      date: '1990-05-15',
      time: '14:30',
      timezone: 'Europe/Madrid',
    })
    expect(instant).toEqual({
      ...fromUTC('1990-05-15T12:30:00Z'),
      local: '1990-05-15T14:30:00+02:00',
    })
    expect(warnings).toEqual([])
  })

  it('reads seconds and fractions of a second', () => {
    const { instant } = fromLocal({
      date: '1990-05-15',
      time: '14:30:15.5',
      timezone: 'Europe/Madrid',
    })
    expect(instant.utc).toBe('1990-05-15T12:30:15.500Z')
    expect(instant.local).toBe('1990-05-15T14:30:15.500+02:00')
  })

  describe('daylight saving in Spain', () => {
    it('takes the first occurrence of a repeated time and warns', () => {
      const { instant, warnings } = fromLocal({
        date: '2024-10-27',
        time: '02:30',
        timezone: 'Europe/Madrid',
      })
      expect(instant.utc).toBe('2024-10-27T00:30:00Z')
      expect(instant.local).toBe('2024-10-27T02:30:00+02:00')
      expect(warnings).toHaveLength(1)
      expect(warnings[0]?.code).toBe('AMBIGUOUS_LOCAL_TIME')
      expect(warnings[0]?.message).toContain('2024-10-27T02:30:00+02:00')
    })

    it('moves a skipped time forward by the gap and warns', () => {
      const { instant, warnings } = fromLocal({
        date: '2024-03-31',
        time: '02:30',
        timezone: 'Europe/Madrid',
      })
      expect(instant.utc).toBe('2024-03-31T01:30:00Z')
      expect(instant.local).toBe('2024-03-31T03:30:00+02:00')
      expect(warnings).toHaveLength(1)
      expect(warnings[0]?.code).toBe('NONEXISTENT_LOCAL_TIME')
      expect(warnings[0]?.message).toContain('2024-03-31T03:30:00+02:00')
    })

    it('does not warn just before or after a change', () => {
      for (const time of ['01:59', '03:00']) {
        expect(fromLocal({ date: '2024-03-31', time, timezone: 'Europe/Madrid' }).warnings).toEqual(
          [],
        )
      }
      for (const time of ['01:59', '03:00']) {
        expect(fromLocal({ date: '2024-10-27', time, timezone: 'Europe/Madrid' }).warnings).toEqual(
          [],
        )
      }
    })
  })

  describe('daylight saving in the southern hemisphere (Sydney)', () => {
    it('takes the first occurrence of a repeated time in April', () => {
      const { instant, warnings } = fromLocal({
        date: '2024-04-07',
        time: '02:30',
        timezone: 'Australia/Sydney',
      })
      expect(instant.local).toBe('2024-04-07T02:30:00+11:00')
      expect(instant.utc).toBe('2024-04-06T15:30:00Z')
      expect(warnings[0]?.code).toBe('AMBIGUOUS_LOCAL_TIME')
    })

    it('moves a skipped time forward in October', () => {
      const { instant, warnings } = fromLocal({
        date: '2024-10-06',
        time: '02:30',
        timezone: 'Australia/Sydney',
      })
      expect(instant.local).toBe('2024-10-06T03:30:00+11:00')
      expect(instant.utc).toBe('2024-10-05T16:30:00Z')
      expect(warnings[0]?.code).toBe('NONEXISTENT_LOCAL_TIME')
    })
  })

  describe('historical offsets', () => {
    it('applies war time in India (+06:30 in 1943, +05:30 in 1942)', () => {
      const war = fromLocal({ date: '1943-06-01', time: '12:00', timezone: 'Asia/Kolkata' })
      expect(war.instant.local).toBe('1943-06-01T12:00:00+06:30')
      expect(war.instant.utc).toBe('1943-06-01T05:30:00Z')

      const between = fromLocal({ date: '1942-06-01', time: '12:00', timezone: 'Asia/Kolkata' })
      expect(between.instant.local).toBe('1942-06-01T12:00:00+05:30')
    })

    it('applies local mean time before standard time, with its seconds', () => {
      const madrid = fromLocal({ date: '1890-01-01', time: '12:00', timezone: 'Europe/Madrid' })
      expect(madrid.instant.local).toBe('1890-01-01T12:00:00-00:14:44')
      expect(madrid.instant.utc).toBe('1890-01-01T12:14:44Z')

      const newYork = fromLocal({ date: '1850-06-01', time: '12:00', timezone: 'America/New_York' })
      expect(newYork.instant.local).toBe('1850-06-01T12:00:00-04:56:02')
    })

    it('handles the switch from local mean time to standard time as a gap', () => {
      // Madrid moved from −00:14:44 to +00:00 at 1901-01-01 00:00 UTC: local clocks jumped
      // from 23:45:16 to 00:00, so 23:50 on December 31 never happened.
      const { instant, warnings } = fromLocal({
        date: '1900-12-31',
        time: '23:50',
        timezone: 'Europe/Madrid',
      })
      expect(warnings[0]?.code).toBe('NONEXISTENT_LOCAL_TIME')
      expect(instant.utc).toBe('1901-01-01T00:04:44Z')
      expect(instant.local).toBe('1901-01-01T00:04:44+00:00')

      const after = fromLocal({ date: '1901-01-01', time: '00:05', timezone: 'Europe/Madrid' })
      expect(after.warnings).toEqual([])
      expect(after.instant.local).toBe('1901-01-01T00:05:00+00:00')
    })
  })

  it('reads UTC as a time zone', () => {
    const { instant } = fromLocal({ date: '1990-05-15', time: '12:30', timezone: 'UTC' })
    expect(instant.local).toBe('1990-05-15T12:30:00+00:00')
    expect(instant.utc).toBe('1990-05-15T12:30:00Z')
  })
})

describe('fromLocal with utcOffset', () => {
  it('applies a fixed offset', () => {
    expect(fromLocal({ date: '1990-05-15', time: '14:30', utcOffset: '+02:00' }).instant.utc).toBe(
      '1990-05-15T12:30:00Z',
    )
    expect(fromLocal({ date: '1990-05-15', time: '06:15', utcOffset: '-03:30' }).instant.utc).toBe(
      '1990-05-15T09:45:00Z',
    )
    expect(
      fromLocal({ date: '1990-05-15', time: '18:15', utcOffset: '+05:45' }).instant.local,
    ).toBe('1990-05-15T18:15:00+05:45')
  })

  it('reads +00:00 as UTC', () => {
    const { instant } = fromLocal({ date: '1990-05-15', time: '12:30', utcOffset: '+00:00' })
    expect(instant).toEqual({
      ...fromUTC('1990-05-15T12:30:00Z'),
      local: '1990-05-15T12:30:00+00:00',
    })
  })

  it('accepts offsets with seconds', () => {
    const { instant } = fromLocal({ date: '1890-01-01', time: '12:00', utcOffset: '-00:14:44' })
    expect(instant.utc).toBe('1890-01-01T12:14:44Z')
  })

  it('wins over the time zone and never warns', () => {
    const { instant, warnings } = fromLocal({
      date: '2024-10-27',
      time: '02:30',
      timezone: 'Europe/Madrid',
      utcOffset: '+01:00',
    })
    expect(instant.utc).toBe('2024-10-27T01:30:00Z')
    expect(warnings).toEqual([])
  })

  it('crosses the date line when needed', () => {
    const { instant } = fromLocal({ date: '1990-05-15', time: '01:00', utcOffset: '+03:00' })
    expect(instant.utc).toBe('1990-05-14T22:00:00Z')
  })
})

describe('fromLocal errors', () => {
  it.each([
    ['an unknown time zone', { timezone: 'Mars/Olympus' }],
    ['a malformed offset', { utcOffset: '+2' }],
    ['an offset without colon', { utcOffset: '+0200' }],
    ['an offset with too many minutes', { utcOffset: '+02:60' }],
    ['an offset beyond 18 hours', { utcOffset: '+19:00' }],
    ['neither time zone nor offset', {}],
  ])('rejects %s with InvalidTimeZoneError', (_, zone) => {
    expect(() => fromLocal({ date: '1990-05-15', time: '14:30', ...zone })).toThrow(
      InvalidTimeZoneError,
    )
  })

  it.each([
    ['a date that does not exist', { date: '1990-02-30', time: '14:30' }],
    ['a time with only hours', { date: '1990-05-15', time: '14' }],
    ['a time with a zone', { date: '1990-05-15', time: '14:30Z' }],
    ['a date-time as date', { date: '1990-05-15T14:30', time: '14:30' }],
    ['an hour out of range', { date: '1990-05-15', time: '24:00' }],
  ])('rejects %s with InvalidDateError', (_, input) => {
    expect(() => fromLocal({ ...input, timezone: 'Europe/Madrid' })).toThrow(InvalidDateError)
  })

  it('explains how to fix a missing time zone', () => {
    try {
      fromLocal({ date: '1990-05-15', time: '14:30' })
      expect.unreachable()
    } catch (error) {
      const invalid = error as InvalidTimeZoneError
      expect(invalid.code).toBe('INVALID_TIME_ZONE')
      expect(invalid.input).toBe('')
      expect(invalid.suggestion).toContain('utcOffset')
    }
  })
})

it('returns plain data', () => {
  const result = fromLocal({ date: '2024-10-27', time: '02:30', timezone: 'Europe/Madrid' })
  expect(JSON.parse(JSON.stringify(result))).toEqual(result)
})
