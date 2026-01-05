import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Payload = {
  user_id: string
  name: string
  email: string
  phone: string
  address: string
  felir_number: string
  lat: number
  lng: number
}

function isValidPhone(phone: string) {
  const normalized = phone.replace(/[\s-]/g, '')
  return /^(\+36|06|0036)\d{7,}$/.test(normalized)
}

function isValidFelir(felir: string) {
  return /^[A-Za-z]{2}\d{7}$/.test(felir)
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Payload>
    const required = ['user_id', 'name', 'email', 'phone', 'address', 'felir_number', 'lat', 'lng'] as const
    for (const key of required) {
      if (body[key] == null || String(body[key]).trim() === '') {
        return NextResponse.json({ error: 'Minden mező kötelező.' }, { status: 400 })
      }
    }

    if (!isValidPhone(body.phone!)) {
      return NextResponse.json({ error: 'A telefonszám formátuma hibás. +36, 06 vagy 0036 kezdet kötelező.' }, { status: 400 })
    }
    if (!isValidFelir(body.felir_number!)) {
      return NextResponse.json({ error: 'A FELIR szám formátuma hibás (2 betu + 7 szam).' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('tenants').upsert({
      user_id: body.user_id,
      name: body.name?.trim(),
      email: body.email?.trim(),
      phone: body.phone?.trim(),
      address: body.address?.trim(),
      felir_number: body.felir_number?.trim(),
      lat: body.lat,
      lng: body.lng,
    }, { onConflict: 'user_id' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Hiba' }, { status: 500 })
  }
}
