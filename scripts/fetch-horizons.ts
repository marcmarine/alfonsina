// Regenerates tests/reference-data/horizons.json from JPL Horizons.
// Usage: bun run fetch-horizons. Only needed to change the samples; review and commit the diff.

import { writeFile } from 'node:fs/promises'
import {
  buildSamples,
  HORIZONS_IDS,
  type HorizonsRow,
  parseHorizons,
  queryInstants,
  queryUrl,
  type ReferenceBody,
  type ReferenceData,
  type ReferenceSample,
  renderReferenceData,
  SAMPLES_PER_REQUEST,
  sampleInstants,
} from './horizons-data.ts'

const OUTPUT = new URL('../tests/reference-data/horizons.json', import.meta.url)

async function fetchRows(body: ReferenceBody, instants: number[]): Promise<HorizonsRow[]> {
  const response = await fetch(queryUrl(body, queryInstants(instants)))
  if (!response.ok) throw new Error(`Horizons answered ${response.status} for ${body}.`)
  const { result } = (await response.json()) as { result: string }
  return parseHorizons(result)
}

async function fetchBody(body: ReferenceBody, instants: number[]): Promise<ReferenceSample[]> {
  const rows: HorizonsRow[] = []
  // One request at a time: Horizons asks API users not to send parallel requests.
  for (let index = 0; index < instants.length; index += SAMPLES_PER_REQUEST) {
    rows.push(...(await fetchRows(body, instants.slice(index, index + SAMPLES_PER_REQUEST))))
  }
  return buildSamples(instants, rows)
}

const instants = sampleInstants()
const bodies = {} as Record<ReferenceBody, ReferenceSample[]>
for (const body of Object.keys(HORIZONS_IDS) as ReferenceBody[]) {
  bodies[body] = await fetchBody(body, instants)
  console.log(`${body}: ${bodies[body].length} samples`)
}

const data: ReferenceData = {
  source:
    'JPL Horizons (DE441), geocentric observer table, TT: apparent ecliptic longitude and ' +
    'latitude of date (quantity 31), distance (quantity 20). Speeds: central differences ' +
    'of ±0.05 day; distance speed from deldot.',
  generatedOn: new Date().toISOString().slice(0, 10),
  columns:
    'julianDayTT, longitude, latitude, distance, longitudeSpeed, latitudeSpeed, distanceSpeed',
  bodies,
}
await writeFile(OUTPUT, renderReferenceData(data))
console.log(`Wrote ${instants.length} instants for ${Object.keys(bodies).length} bodies.`)
