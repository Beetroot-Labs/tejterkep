import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function isValidPhone(phone: string) {
  const normalized = phone.replace(/[\s-]/g, '')
  return /^(\+36|06|0036)\d{7,}$/.test(normalized)
}

function isValidFelir(felir: string) {
  return /^[A-Za-z]{2}\d{7}$/.test(felir)
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
  if (!isValidPhone(phone)) {
    return bad('A telefonszám formátuma hibás. +36, 06 vagy 0036 kezdet kötelező.')
  }
  if (!isValidFelir(felir)) {
    return bad('A FELIR szám formátuma hibás (2 betu + 7 szam).')
  }

  if (body.lat == null || body.lng == null) {
    return bad('A hely koordinátái kötelezőek.')
  }
  const lat = Number(body.lat)
  const lng = Number(body.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return bad('A koordináták érvénytelenek.')
  }

  try {
    // 1) Auth user létrehozása (email megerősítéssel)
    const { data: created, error: createErr } = await supabaseAdmin.auth.signUp({
      email,
      password,
    })
    if (createErr) return bad(createErr.message, 400)
    const userId = created.user?.id
    if (!userId) return bad('Nem sikerült létrehozni a felhasználót.', 400)

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
