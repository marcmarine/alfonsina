import { describe, expect, it } from 'vitest'
import {
  buildDeltaTData,
  FIRST_YEAR,
  parseHistoric,
  parseMonthly,
  renderDeltaTData,
} from './delta-t-data.ts'

/** Historic file in USNO's layout: half-yearly rows from 1657 to 1973. */
function historicFile(): string {
  const rows = [
    '  Year    TDT-UT1    error     LOD      error',
    '             (s)      (s)      (ms)     (ms)',
  ]
  for (let year = FIRST_YEAR; year <= 1973; year++) {
    rows.push(`${year}.000     ${(year - 1600) / 10}       1        0       1`)
    rows.push(`${year}.500     ${(year - 1600) / 10 + 0.05}       1        0       1`)
  }
  return rows.join('\n')
}

/** Monthly file in USNO's layout, from 1973-02 to the given month. */
function monthlyFile(lastYear: number, lastMonth: number): string {
  const rows: string[] = []
  for (let year = 1973; year <= lastYear; year++) {
    for (let month = 1; month <= 12; month++) {
      if (year === 1973 && month === 1) continue
      if (year === lastYear && month > lastMonth) break
      rows.push(
        ` ${year} ${String(month).padStart(2)}  1  ${(40 + (year - 1973) + month / 100).toFixed(4)}`,
      )
    }
  }
  return rows.join('\n')
}

describe('parseHistoric', () => {
  it('keeps only the January 1 rows, as written', () => {
    const values = parseHistoric(historicFile())
    expect(values.get(1657)).toBe('5.7')
    expect(values.get(1973)).toBe('37.3')
    expect(values.size).toBe(1973 - FIRST_YEAR + 1)
  })
})

describe('parseMonthly', () => {
  it('reads every row and skips anything else', () => {
    const values = parseMonthly(`header line\n${monthlyFile(1974, 2)}\n\n`)
    expect(values[0]).toEqual({ year: 1973, month: 2, day: 1, seconds: '40.0200' })
    expect(values.at(-1)).toEqual({ year: 1974, month: 2, day: 1, seconds: '41.0200' })
    expect(values).toHaveLength(13)
  })
})

describe('buildDeltaTData', () => {
  it('takes historic values up to 1973, monthly ones after, and the latest month', () => {
    const data = buildDeltaTData(historicFile(), monthlyFile(2026, 10))
    expect(data.firstYear).toBe(FIRST_YEAR)
    expect(data.yearly).toHaveLength(2026 - FIRST_YEAR + 1)
    expect(data.yearly[1973 - FIRST_YEAR]).toBe('37.3')
    expect(data.yearly[1974 - FIRST_YEAR]).toBe('41.0100')
    expect(data.yearly.at(-1)).toBe('93.0100')
    expect(data.latest).toEqual({ date: '2026-10-01', seconds: '93.1000' })
  })

  it('fails when a year is missing', () => {
    const monthly = monthlyFile(2026, 10)
      .split('\n')
      .filter((row) => !row.startsWith(' 1990  1'))
      .join('\n')
    expect(() => buildDeltaTData(historicFile(), monthly)).toThrow('January 1, 1990')
  })

  it('fails when the monthly file has no values', () => {
    expect(() => buildDeltaTData(historicFile(), '<html>Not found</html>')).toThrow('no values')
  })
})

describe('renderDeltaTData', () => {
  const data = {
    firstYear: 1657,
    yearly: ['44', '43', '40'],
    latest: { date: '1659-10-01', seconds: '39.5' },
  }
  const source = renderDeltaTData(data, '2026-11-22')

  it('states where and when the data comes from', () => {
    expect(source).toContain('Generated from USNO data on 2026-11-22')
    expect(source).toContain('https://maia.usno.navy.mil/ser7/historic_deltat.data')
    expect(source).toContain('https://maia.usno.navy.mil/ser7/deltat.data')
  })

  it('writes the constants the ΔT model reads', () => {
    expect(source).toContain('export const MEASURED_FIRST_YEAR = 1657')
    expect(source).toContain('  44, 43, 40,')
    expect(source).toContain(
      "export const LATEST_MEASURED_DELTA_T = { date: '1659-10-01', seconds: 39.5 } as const",
    )
  })
})
