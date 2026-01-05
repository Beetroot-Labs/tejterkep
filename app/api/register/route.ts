import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return bad('Invalid JSON')

  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const phone = String(body.phone ?? '').trim()
  const address = String(body.address ?? '').trim()
  const felir = String(body.felir_number ?? '').trim()
  const password = String(body.password ?? '')

  if (!name || !email || !phone || !address || !felir || !password) {
    return bad('Missing required fields')
  }

  // Geocode (opcionális, ha már akarod itt is)
  let lat: number | null = null
  let lng: number | null = null

  // Ha már van /api/geocode endpointod, meghívhatod itt is szerveroldalon.
  // De egyszerűbb: a kliens már elküldi lat/lng-t, és itt csak validálod.
  if (body.lat != null && body.lng != null) {
    lat = Number(body.lat)
    lng = Number(body.lng)
  }

  try {
    // 1) Auth user létrehozása (admin)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // MVP: ne kelljen email megerősítés
    })
    if (createErr) return bad(createErr.message, 400)
    const userId = created.user.id

    // 2) Tenant rekord beszúrás (RLS-t bypassolja a service role)
    const { error: insErr } = await supabaseAdmin.from('tenants').insert({
      user_id: userId,
      name,
      email,
      phone,
      address,
      lat,
      lng,
      felir_number: felir,
    })
    if (insErr) {
      // rollback jelleggel: ha tenant insert fail, töröljük az auth usert
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return bad(insErr.message, 400)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return bad(e?.message ?? 'Server error', 500)
  }
}

