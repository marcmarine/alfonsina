// Builds the JPL Horizons reference data in tests/reference-data/horizons.json.
// Pure functions; the download lives in fetch-horizons.ts.

export const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api'

/**
 * Horizons ids of the bodies of the engine contract. Planets with moons use the barycentre
 * of their system: DE441 gives it over the whole span (body centres start in 1600), it is
 * what DE-based engines compute, and it differs from the centre by 0.1″ at most (Pluto).
 */
export const HORIZONS_IDS = {
  sun: '10',
  moon: '301',
  mercury: '199',
  venus: '299',
  mars: '4',
  jupiter: '5',
  saturn: '6',
  uranus: '7',
  neptune: '8',
  pluto: '9',
} as const

export type ReferenceBody = keyof typeof HORIZONS_IDS

/** Half step of the central differences that give the reference speeds, in days. */
export const SPEED_STEP = 0.05

const KILOMETRES_PER_AU = 149597870.7
const SECONDS_PER_DAY = 86400

/** naelos coverage (1551–2649) and caelus coverage (1885–2100), Julian Days TT. */
const WIDE = { start: 2287550.5, end: 2688587.5, count: 56 }
const MODERN = { start: 2409542.5, end: 2488069.5, count: 40 }

/**
 * Sample instants, Julian Days TT: evenly spaced over each span, kept away from its ends so
 * the speed neighbours stay inside, with a varying time of day.
 */
export function sampleInstants(): number[] {
  const instants: number[] = []
  for (const { start, end, count } of [WIDE, MODERN]) {
    const first = start + 1
    const step = (end - 1 - first) / (count - 1)
    for (let index = 0; index < count; index += 1) {
      const timeOfDay = (index * 0.137) % 1
      instants.push(Math.round((Math.floor(first + index * step) + timeOfDay) * 1e4) / 1e4)
    }
  }
  return instants.sort((a, b) => a - b)
}

/** Samples per request: Horizons answers 502 to longer time lists in a URL. */
export const SAMPLES_PER_REQUEST = 20

/** Every instant with its two speed neighbours, in the order the samples are built. */
export function queryInstants(instants: readonly number[]): number[] {
  return instants.flatMap((instant) => [instant - SPEED_STEP, instant, instant + SPEED_STEP])
}

/**
 * Observer table, geocentric, TT: quantity 20 gives the distance and its rate, quantity 31
 * the apparent ecliptic longitude and latitude of date.
 */
export function queryUrl(body: ReferenceBody, instants: readonly number[]): string {
  const parameters: Record<string, string> = {
    COMMAND: HORIZONS_IDS[body],
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'OBSERVER',
    CENTER: '500@399',
    TLIST: instants.map((instant) => instant.toFixed(4)).join(' '),
    TIME_TYPE: 'TT',
    QUANTITIES: '20,31',
    ANG_FORMAT: 'DEG',
    EXTRA_PREC: 'YES',
    CSV_FORMAT: 'YES',
  }
  const query = Object.entries(parameters)
    .map(([key, value]) => `${key}=${encodeURIComponent(`'${value}'`)}`)
    .join('&')
  // Every value is quoted except `format`, which Horizons rejects with quotes.
  return `${HORIZONS_API}?format=json&${query}`
}

export interface HorizonsRow {
  /** AU. */
  distance: number
  /** km/s. */
  distanceRate: number
  /** Degrees. */
  longitude: number
  /** Degrees. */
  latitude: number
}

/** Reads the rows between `$$SOE` and `$$EOE` of a CSV observer table with quantities 20,31. */
export function parseHorizons(result: string): HorizonsRow[] {
  const start = result.indexOf('$$SOE')
  const end = result.indexOf('$$EOE')
  if (start < 0 || end < start) {
    throw new Error(`Horizons returned no ephemeris:\n${result.slice(0, 2000)}`)
  }
  return result
    .slice(start + 5, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // Date, two flag columns, delta, deldot, ObsEcLon, ObsEcLat.
      const [, , , distance, distanceRate, longitude, latitude] = line
        .split(',')
        .map((cell) => cell.trim())
      const row = {
        distance: Number(distance),
        distanceRate: Number(distanceRate),
        longitude: Number(longitude),
        latitude: Number(latitude),
      }
      if (!Object.values(row).every(Number.isFinite)) {
        throw new Error(`Unexpected Horizons row: ${line}`)
      }
      return row
    })
}

/** `[julianDayTT, longitude, latitude, distance, longitudeSpeed, latitudeSpeed, distanceSpeed]`. */
export type ReferenceSample = [number, number, number, number, number, number, number]

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

/** Difference between two longitudes across the 360° → 0° wrap, in [−180, 180). */
function longitudeDifference(to: number, from: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

/**
 * Turns the rows of `queryInstants(instants)` into samples: positions at each instant,
 * angular speeds by central differences and the distance speed from Horizons' own rate.
 */
export function buildSamples(
  instants: readonly number[],
  rows: readonly HorizonsRow[],
): ReferenceSample[] {
  if (rows.length !== instants.length * 3) {
    throw new Error(`Expected ${instants.length * 3} Horizons rows, got ${rows.length}.`)
  }
  return instants.map((instant, index) => {
    const [before, at, after] = rows.slice(index * 3, index * 3 + 3) as [
      HorizonsRow,
      HorizonsRow,
      HorizonsRow,
    ]
    const span = 2 * SPEED_STEP
    return [
      instant,
      at.longitude,
      at.latitude,
      at.distance,
      round(longitudeDifference(after.longitude, before.longitude) / span, 7),
      round((after.latitude - before.latitude) / span, 7),
      round((at.distanceRate * SECONDS_PER_DAY) / KILOMETRES_PER_AU, 10),
    ]
  })
}

export interface ReferenceData {
  source: string
  generatedOn: string
  columns: string
  bodies: Record<ReferenceBody, ReferenceSample[]>
}

export function renderReferenceData(data: ReferenceData): string {
  return `${JSON.stringify(data, null, 2)}\n`
}
