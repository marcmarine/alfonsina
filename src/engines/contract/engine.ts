import type { Body, BodyState } from './body.ts';
import type { JulianDayTT, TimeRange } from './julian-day.ts';

/** What an adapter declares about itself. The API copies it into every result's `meta`. */
export interface EngineInfo {
  /** Stable adapter id, e.g. `'caelus'` or `'naelos'`. */
  id: string;
  /** Name of the underlying ephemeris library. */
  name: string;
  /** Version of the underlying ephemeris library. */
  version: string;
  /** SPDX license identifier of the underlying ephemeris library. */
  license: string;
  /** Source of the positions, e.g. `'JPL DE440'`. */
  source: string;
  /** Range in which the engine returns validated results. */
  coverage: TimeRange;
}

/**
 * The engine contract: the only port between Alfonsina and an ephemeris library.
 *
 * Rules every adapter follows:
 *
 * - `load()` is the only async method; `state()` is synchronous.
 * - Speeds are mandatory. An adapter whose library lacks them derives them by central
 *   differences.
 * - Positions are apparent geocentric, ecliptic and true equinox of date.
 * - Outside its coverage, for an unsupported body or before its data is loaded, an engine
 *   throws a typed error (`OutOfRangeError`, `UnsupportedBodyError`,
 *   `EngineNotReadyError`). It never returns a silently wrong value.
 * - Engines compute no houses, angles, sidereal time, obliquity or nutation.
 */
export interface AstronomyEngine {
  readonly info: EngineInfo;
  readonly bodies: ReadonlySet<Body>;

  /**
   * Ensures `state()` can answer for every instant in the range: one-time setup on the
   * first call, plus any on-demand data. Idempotent, and instant when everything is
   * already loaded.
   *
   * @throws {OutOfRangeError} If the range is not within the engine's coverage.
   */
  load(range: TimeRange): Promise<void>;

  /**
   * State of a body at an instant. Synchronous and cheap: searches call it tens of
   * thousands of times.
   *
   * @throws {UnsupportedBodyError} If the body is not in `bodies`.
   * @throws {OutOfRangeError} If the instant is outside the engine's coverage.
   * @throws {EngineNotReadyError} If the data for the instant has not been loaded.
   */
  state(body: Body, julianDay: JulianDayTT): BodyState;
}
