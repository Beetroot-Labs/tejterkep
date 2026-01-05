import { NextResponse } from 'next/server'

export const runtime = 'nodejs' // fontos: server oldalon fusson

type GeocodeResult = {
  lat: number
  lng: number
  formatted_address?: string
}

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}

async function geocodeGoogle(address: string): Promise<GeocodeResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) throw new Error('Missing GOOGLE_MAPS_API_KEY')

  const url =
    'https://maps.googleapis.com/maps/api/geocode/json' +
    `?address=${encodeURIComponent(address)}` +
    `&key=${encodeURIComponent(key)}` +
    `&region=hu`

  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Google geocode HTTP ${r.status}`)
  const j = await r.json()

  if (j.status !== 'OK' || !j.results?.length) {
    throw new Error(`Google geocode failed: ${j.status}`)
  }

  const best = j.results[0]
  return {
    lat: best.geometry.location.lat,
    lng: best.geometry.location.lng,
    formatted_address: best.formatted_address,
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const address = body?.address?.trim()
  if (!address) return badRequest('address is required')

  const provider = (process.env.GEOCODING_PROVIDER ?? 'google').toLowerCase()

  try {
    const result =
      provider === 'google'
        ? await geocodeGoogle(address)
        : (() => {
            throw new Error(`Unsupported geocoding provider: ${provider}`)
          })()

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'geocode error' },
      { status: 500 }
    )
  }
}

