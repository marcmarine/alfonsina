import {
  ENGINE,
  NaelosEphemeris,
  SE_JUPITER,
  SE_MARS,
  SE_MERCURY,
  SE_MOON,
  SE_NEPTUNE,
  SE_PLUTO,
  SE_SATURN,
  SE_SUN,
  SE_URANUS,
  SE_VENUS,
  SEFLG_SPEED,
  tablesFor,
} from 'naelos-ephemeris'
import {
  type AstronomyEngine,
  BODIES,
  type Body,
  type BodyState,
  EngineNotReadyError,
  type JulianDayTT,
  OutOfRangeError,
  type TimeRange,
  UnsupportedBodyError,
} from '../contract/index.ts'

const ID = 'naelos'

/**
 * 1551-01-01 to 2649-01-01, 0h TT: the JPL DE440 tables shipped in the naelos-ephemeris
 * package (1550-01-10 to 2649-01-16), with a few days of margin for light-time and speeds.
 * The DE441 tables beyond them are downloaded separately and not supported.
 */
export const NAELOS_COVERAGE: TimeRange = {
  start: 2287550.5 as JulianDayTT,
  end: 2688587.5 as JulianDayTT,
}

/** Returns the bytes of a naelos table file, given its name (e.g. `'ne-2000.bin'`). */
export type NaelosTableLoader = (name: string) => Promise<ArrayBuffer | Uint8Array>

export interface NaelosEngineOptions {
  /**
   * Where the table files come from. Defaults to the files of the installed
   * naelos-ephemeris package in Node, Bun and Deno. Required anywhere else (browsers,
   * workers, React Native), e.g. `(name) => fetch(`/naelos/${name}`).then((response) =>
   * response.arrayBuffer())` with the package's `data/` files served from `/naelos/`.
   */
  tables?: NaelosTableLoader
}

const BODY_NUMBERS: Record<Body, number> = {
  sun: SE_SUN,
  moon: SE_MOON,
  mercury: SE_MERCURY,
  venus: SE_VENUS,
  mars: SE_MARS,
  jupiter: SE_JUPITER,
  saturn: SE_SATURN,
  uranus: SE_URANUS,
  neptune: SE_NEPTUNE,
  pluto: SE_PLUTO,
}

interface NodeProcess {
  versions?: { node?: string }
}

/** Whether the code runs in Node or a runtime that emulates it (Bun, Deno). */
function isNodeLike(): boolean {
  const process = (globalThis as { process?: NodeProcess }).process
  return typeof process?.versions?.node === 'string'
}

/**
 * Reads table files from the installed naelos-ephemeris package. Exported for tests only,
 * not from the entry point. The Node modules are
 * imported dynamically, and hidden from bundlers, so that browser builds never see them.
 */
export const readPackageTable: NaelosTableLoader = async (name) => {
  const moduleSpecifier = 'node:module'
  const fileSystemSpecifier = 'node:fs/promises'
  const { createRequire } = await import(
    /* @vite-ignore */ /* webpackIgnore: true */ moduleSpecifier
  )
  const { readFile } = await import(
    /* @vite-ignore */ /* webpackIgnore: true */ fileSystemSpecifier
  )
  // `types: []` leaves `ImportMeta` without `url`, which every ES module runtime provides.
  const require = createRequire((import.meta as ImportMeta & { url: string }).url)
  return readFile(require.resolve(`naelos-ephemeris/data/${name}`))
}

function contains(range: TimeRange, julianDay: number): boolean {
  return julianDay >= range.start && julianDay <= range.end
}

/** naelos-ephemeris exports its version only inside `ENGINE`, e.g. `'Naelos Ephemeris 0.1.2'`. */
function libraryVersion(): string {
  return /\d+\.\d+\.\d+\S*$/.exec(ENGINE)?.[0] ?? ENGINE
}

/**
 * Engine backed by naelos-ephemeris, with JPL DE440 positions. `load()` fetches the century
 * tables a range needs, once each; `state()` throws `EngineNotReadyError` for an instant
 * whose table has not been loaded.
 *
 * @throws {Error} Outside Node, Bun and Deno, if `options.tables` is not given.
 */
export function naelosEngine(options: NaelosEngineOptions = {}): AstronomyEngine {
  const loader = options.tables ?? (isNodeLike() ? readPackageTable : undefined)
  if (loader === undefined) {
    throw new Error(
      'naelosEngine() needs the `tables` option outside Node, Bun and Deno. Serve the ' +
        "files of 'naelos-ephemeris/data/' and pass a function that fetches one by name, " +
        "e.g. tables: (name) => fetch('/naelos/' + name).then((response) => response.arrayBuffer()).",
    )
  }

  const loadTable: NaelosTableLoader = loader
  const bodies: ReadonlySet<Body> = new Set(BODIES)
  /** One promise per table file, so concurrent loads fetch each file once. */
  const tables = new Map<string, Promise<void>>()
  let ephemeris: NaelosEphemeris | undefined

  function addTable(bytes: ArrayBuffer | Uint8Array): void {
    if (ephemeris === undefined) {
      ephemeris = NaelosEphemeris.fromBuffers([bytes])
    } else {
      ephemeris.addTables([bytes])
    }
  }

  function loadOnce(name: string): Promise<void> {
    let pending = tables.get(name)
    if (pending === undefined) {
      pending = loadTable(name).then(addTable)
      // A failed file can be retried by a later load().
      pending.catch(() => tables.delete(name))
      tables.set(name, pending)
    }
    return pending
  }

  return {
    info: {
      id: ID,
      name: 'naelos-ephemeris',
      version: libraryVersion(),
      license: 'Apache-2.0',
      source: 'JPL DE440',
      coverage: NAELOS_COVERAGE,
    },
    bodies,

    async load(range: TimeRange): Promise<void> {
      if (!contains(NAELOS_COVERAGE, range.start) || !contains(NAELOS_COVERAGE, range.end)) {
        throw new OutOfRangeError(ID, range, NAELOS_COVERAGE)
      }
      await Promise.all(tablesFor(range.start, range.end).map(loadOnce))
    },

    state(body: Body, julianDay: JulianDayTT): BodyState {
      if (!bodies.has(body)) {
        throw new UnsupportedBodyError(ID, body)
      }
      if (!contains(NAELOS_COVERAGE, julianDay)) {
        throw new OutOfRangeError(ID, julianDay, NAELOS_COVERAGE)
      }
      if (ephemeris === undefined) {
        throw new EngineNotReadyError(ID, julianDay)
      }

      // naelos takes TT directly (`calc`), so its own ΔT model is never used.
      const position = ephemeris.calc(julianDay, BODY_NUMBERS[body], SEFLG_SPEED)
      if ('error' in position) {
        // Inside the coverage, the only failure is a table that has not been loaded.
        throw new EngineNotReadyError(ID, julianDay)
      }

      return {
        body,
        longitude: position.longitude,
        latitude: position.latitude,
        distance: position.distance,
        longitudeSpeed: position.longitudeSpeed,
        latitudeSpeed: position.latitudeSpeed,
        distanceSpeed: position.distanceSpeed,
      }
    },
  }
}
