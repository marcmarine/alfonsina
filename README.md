<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/icon-dark.svg">
    <img src=".github/assets/icon.svg" alt="Alfonsina" width="120">
  </picture>
</p>

<h1 align="center">Alfonsina</h1>

<p align="center">Astrology calculations for JavaScript.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/alfonsina"><img src="https://img.shields.io/npm/v/alfonsina" alt="npm"></a>
  <a href="https://github.com/marcmarine/alfonsina/actions/workflows/ci.yml"><img src="https://github.com/marcmarine/alfonsina/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#engines">Engines</a> ·
  <a href="#charts">Charts</a> ·
  <a href="#aspects-between-charts">Aspects</a> ·
  <a href="#signs">Signs</a> ·
  <a href="#errors">Errors</a> ·
  <a href="#advanced-alfonsinacore">Core</a> ·
  <a href="#conventions">Conventions</a>
</p>

Alfonsina computes charts (planets, angles, houses and aspects) for any moment and place. It wraps existing ephemeris libraries behind a small engine contract, so you choose the engine and the API stays the same. It runs unchanged in Node.js, Bun, browsers and workers, and it returns plain data: drawing the chart is up to you.

## Install

Install Alfonsina and one engine:

```sh
npm install alfonsina caelus
# or, for JPL precision:
npm install alfonsina naelos-ephemeris
```

The engines are optional peer dependencies: only the one you import ends up in your bundle. Alfonsina needs Node.js 22 or later, Bun, or a modern browser.

## Quick start

```ts
import { Alfonsina } from 'alfonsina'
import { caelusEngine } from 'alfonsina/engines/caelus'

const alfonsina = await Alfonsina.create({ engine: caelusEngine() })

const chart = alfonsina.chart({
  date: '1990-05-15',
  time: '14:30',
  location: {
    latitude: 40.4168,
    longitude: -3.7038,
    timezone: 'Europe/Madrid',
  },
})

chart.points.sun // { kind: 'body', body: 'sun', sign: 'taurus', signLongitude: 24.42, house: 9, … }
chart.points.ascendant.sign // 'virgo'
chart.aspects[0] // { between: ['sun', 'moon'], aspect: 'trine', orb: 3.0, applying: false, … }
```

`Alfonsina.create` and `alfonsina.load` are the only asynchronous calls. Everything after them, `chart` included, is synchronous.

## Engines

| Engine                                                                          | Import                     | Data                                                         | Coverage  | Precision                                         |
| ------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------ | --------- | ------------------------------------------------- |
| [caelus](https://www.npmjs.com/package/caelus) (MIT)                            | `alfonsina/engines/caelus` | Embedded, about 100 KB gzipped                               | 1885–2099 | About 1″ for the Sun to Saturn, 2.5″ for the Moon |
| [naelos-ephemeris](https://www.npmjs.com/package/naelos-ephemeris) (Apache-2.0) | `alfonsina/engines/naelos` | JPL DE440 tables, about 640 KB per century, loaded on demand | 1551–2648 | JPL level                                         |

caelus is the simplest start: it works everywhere with no files to serve. naelos gives the precision of the JPL ephemerides and the longest range.

### Loading dates

Engines prepare their data up front, for a range of dates. `create` loads 1900–2100 by default (cut to the engine's coverage); pass `range` to load something else, and `alfonsina.load` to add more later:

```ts
import { naelosEngine } from 'alfonsina/engines/naelos'

const alfonsina = await Alfonsina.create({
  engine: naelosEngine(),
  range: { start: '1950-01-01', end: '2050-01-01' },
})

await alfonsina.load({ start: '1700-01-01', end: '1800-01-01' })
```

A chart outside the loaded dates throws `EngineNotReadyError`, whose message says which `load` call to make. With caelus, loading only checks the range against its coverage.

### naelos in the browser

In Node.js and Bun, naelos reads its tables from the installed package. Anywhere else, give it a `tables` loader that returns the bytes of a table file:

```ts
const engine = naelosEngine({
  tables: (name) =>
    fetch(`https://cdn.jsdelivr.net/npm/naelos-ephemeris@0.1.2/data/${name}`).then((response) =>
      response.arrayBuffer(),
    ),
})
```

You can also serve the files of `naelos-ephemeris/data/` yourself. Each century is one file, so load only the range you need.

## Charts

```ts
const chart = alfonsina.chart({
  date: '1990-05-15', // local date, YYYY-MM-DD
  time: '14:30', // local time: HH:mm, HH:mm:ss or HH:mm:ss.fff
  location: {
    latitude: 40.4168, // degrees, north positive
    longitude: -3.7038, // degrees, east positive
    timezone: 'Europe/Madrid', // an IANA time zone, or…
    // utcOffset: '+02:00',   // …a fixed offset, which wins over `timezone`
  },
  settings: {
    houseSystem: 'placidus', // or 'whole-sign'
    aspects: ['conjunction', 'opposition', 'trine', 'square', 'sextile'], // [] for none
    orbs: { conjunction: 10 }, // degrees; the others keep their default
  },
})
```

Every setting is optional; the values above are the defaults, except the conjunction orb. The default orbs are 8° for conjunctions and oppositions, 7° for trines and squares and 5° for sextiles.

The result:

- **`instant`**: the moment as `local` and `utc` text, and as Julian Days in UT and TT.
- **`points`**: the Sun to Pluto, then the `ascendant`, `mediumCoeli`, `descendant` and `imumCoeli`. Each point has its `longitude`, `sign` and `signLongitude` (degrees within the sign). Bodies also have `latitude`, `longitudeSpeed`, `retrograde` and `house`.
- **`houses`**: the `system` used and the 12 `cusps`, as longitudes.
- **`aspects`**: each pair of points once, with the `aspect`, its `orb` and whether it is `applying`. Pairs of angles are left out.
- **`meta`**: how the chart was computed: the engine and its version, ΔT, the zodiac, the house system asked for and whether the time was given or computed.
- **`warnings`**: anything that makes the chart less certain, with a `code` and a message.

A chart is plain data, with no functions, classes or `Date` objects: it serializes to JSON and crosses `postMessage` as it is.

### Unknown birth time

With `time: 'sunrise'`, the chart is cast for the moment the Sun is on the ascendant that day, a usual convention when the birth time is unknown:

```ts
const chart = alfonsina.chart({ date: '1990-05-15', time: 'sunrise', location })
chart.instant.local // '1990-05-15T07:03:41+02:00'
chart.meta.timeSource // 'sunrise'
```

The chart carries a `SUNRISE_CHART` warning: its angles and houses are those of sunrise, and the Moon may be off by several degrees. Where the Sun does not rise that day (polar day or night), `chart` throws `NoSunriseError`.

### Warnings

| Code                     | When                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `AMBIGUOUS_LOCAL_TIME`   | The local time happens twice (clocks going back); the first is used.                        |
| `NONEXISTENT_LOCAL_TIME` | The local time is skipped (clocks going forward); it is moved forward.                      |
| `DELTA_T_EXTRAPOLATED`   | The date is outside the measured values of ΔT, so the Moon and the angles are less certain. |
| `PLACIDUS_UNDEFINED`     | Placidus houses do not exist at this latitude; whole-sign houses are used.                  |
| `SUNRISE_CHART`          | The chart is cast for sunrise, not for a birth time.                                        |
| `MULTIPLE_SUNRISES`      | The Sun crosses the ascendant more than once that day; the first is used.                   |

## Aspects between charts

`findAspects` compares two sets of points, for instance two charts for a synastry:

```ts
import { findAspects } from 'alfonsina'

findAspects(chartA.points, chartB.points, {
  aspects: ['conjunction', 'opposition'],
})
// [{ between: ['sun', 'pluto'], aspect: 'opposition', orb: 2.02, … }, …]
```

It takes the same `aspects` and `orbs` options as a chart. Points only need a `longitude`; with `longitudeSpeed`, aspects also say whether they are applying.

## Signs

```ts
import { zodiac } from 'alfonsina'

zodiac.signOf(54.42) // 'taurus'
zodiac.signLongitude(54.42) // 24.42
zodiac.signLongitudeParts(54.42) // { sign: 'taurus', degrees: 24, minutes: 25, seconds: 12 }
```

Formatting and translations are left to your app.

## Errors

Every error has a `code` and a message that says what to change. The error classes are exported from `alfonsina`:

| Class                  | Code                | When                                              |
| ---------------------- | ------------------- | ------------------------------------------------- |
| `InvalidDateError`     | `INVALID_DATE`      | A date or time that cannot be read.               |
| `InvalidTimeZoneError` | `INVALID_TIME_ZONE` | An unknown time zone or offset, or neither given. |
| `NoSunriseError`       | `NO_SUNRISE`        | `time: 'sunrise'` on a day without sunrise.       |
| `OutOfRangeError`      | `OUT_OF_RANGE`      | A date outside the engine's coverage.             |
| `EngineNotReadyError`  | `ENGINE_NOT_READY`  | A date outside the loaded range.                  |
| `UnsupportedBodyError` | `UNSUPPORTED_BODY`  | A body the engine does not compute.               |

`OutOfRangeError`, `EngineNotReadyError` and `UnsupportedBodyError` extend `EngineError`. Coordinates, settings and orbs out of range throw a `RangeError`.

```ts
import { EngineNotReadyError } from 'alfonsina'

try {
  alfonsina.chart(input)
} catch (error) {
  if (error instanceof EngineNotReadyError) await alfonsina.load(range)
  else throw error
}
```

## Advanced: `alfonsina/core`

`alfonsina/core` publishes the building blocks the library uses, without astrological criteria:

```ts
import { aspects, degrees, earth, time } from 'alfonsina/core'

const instant = time.fromUTC('1990-05-15T12:30:00Z') // UTC, Julian Days UT and TT
time.deltaT(instant.julianDayUT) // seconds
earth.apparentSiderealTime(instant, -3.7038) // degrees
aspects.offset(54.42, 297.42, aspects.exactAngle('trine')) // degrees from exact
degrees.normalize(-30) // 330
```

With `alfonsina.engine.state(body, julianDayTT)` you get a body's position and speed directly, to build your own techniques on top.

## Conventions

- Tropical zodiac; Placidus or whole-sign houses.
- Apparent geocentric positions, ecliptic and true equinox of date.
- Engines receive Terrestrial Time; angles and houses use Universal Time. A single ΔT model converts between them, from measured values and polynomials outside them.
- Earth orientation follows the IAU 2006/2000B models, so angles and houses are the same with every engine.
- Sunrise is the moment the centre of the Sun is on the ascendant, without refraction: a few minutes after the sunrise of almanacs.

## License

[MIT](LICENSE)
