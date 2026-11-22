/**
 * Julian Day in Terrestrial Time (TT), the uniform time scale engines compute in.
 *
 * At runtime it is a plain number. The brand only lets the compiler reject a UT value
 * where TT is expected, and vice versa.
 */
export type JulianDayTT = number & { readonly __timeScale: 'TT' };

/**
 * Julian Day in Universal Time (UT), the time scale of Earth rotation, used for sidereal
 * time and chart angles.
 *
 * At runtime it is a plain number. The brand only lets the compiler reject a TT value
 * where UT is expected, and vice versa.
 */
export type JulianDayUT = number & { readonly __timeScale: 'UT' };

/** A range of instants in Julian Days TT, as engines receive it. Both ends included. */
export interface TimeRange {
  start: JulianDayTT;
  end: JulianDayTT;
}
