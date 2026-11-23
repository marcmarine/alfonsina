// Cost of engine.state() per body and engine. Run with `bun run bench`; not part of CI.

import { test } from 'vitest'
import { caelusEngine } from '../../src/engines/caelus/index.ts'
import { type AstronomyEngine, BODIES, type JulianDayTT } from '../../src/engines/contract/index.ts'
import { naelosEngine } from '../../src/engines/naelos/index.ts'

/** 2000-01-01 to 2010-01-01, 0h TT. */
const range = { start: 2451544.5 as JulianDayTT, end: 2455197.5 as JulianDayTT }

/** Instants spread over the range with an irrational step, so no cache sees a repeat. */
const INSTANTS = Array.from(
  { length: 1000 },
  (_, index) =>
    (range.start +
      ((index * 0.6180339887498949 * 3653) % (range.end - range.start))) as JulianDayTT,
)

const engines: [string, () => AstronomyEngine][] = [
  ['caelus', caelusEngine],
  ['naelos', naelosEngine],
]

for (const [name, createEngine] of engines) {
  test(`${name} state() per body`, async ({ bench }) => {
    const engine = createEngine()
    await engine.load(range)
    const registrations = BODIES.map((body) => {
      let index = 0
      return bench(body, () => {
        engine.state(body, INSTANTS[index] as JulianDayTT)
        index = (index + 1) % INSTANTS.length
      })
    })
    await bench.compare(...registrations)
  })
}
