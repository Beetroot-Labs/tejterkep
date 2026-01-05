'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { requireUser } from '@/lib/requireUser'
import dynamic from 'next/dynamic'

type TenantForm = {
  name: string
  email: string
  phone: string
  address: string
  felir_number: string
}

type LatLng = { lat: number; lng: number; source: 'geo' | 'manual' }

const hungaryCenter = { lat: 47.1625, lng: 19.5033 }

const MapPicker = dynamic(() => import('@/app/components/MapPicker'), { ssr: false })

export default function FarmerProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [geoPreview, setGeoPreview] = useState<{ lat: number; lng: number; formatted: string | null; address: string } | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [pickedLocation, setPickedLocation] = useState<LatLng | null>(null)
  const skipNextGeocodeRef = useRef(false)

  const [form, setForm] = useState<TenantForm>({
    name: '',
    email: '',
    phone: '',
    address: '',
    felir_number: '',
  })

  useEffect(() => {
    ;(async () => {
      try {
        const user = await requireUser()

        // Megnézzük, van-e már tenant rekord a user_id-hoz
        const { data, error } = await supabaseBrowser
          .from('tenants')
          .select('id,name,email,phone,address,felir_number,lat,lng')
          .eq('user_id', user.id)
          .maybeSingle()

        if (error) throw error

        if (data) {
          setTenantId(data.id)
          setForm({
            name: data.name ?? '',
            email: data.email ?? user.email ?? '',
            phone: data.phone ?? '',
            address: data.address ?? '',
            felir_number: data.felir_number ?? '',
          })
          if (data.lat != null && data.lng != null) {
            setPickedLocation({ lat: data.lat, lng: data.lng, source: 'manual' })
            if (data.address) {
              setGeoPreview({
                lat: data.lat,
                lng: data.lng,
                formatted: null,
                address: data.address,
              })
            }
          }
        } else {
          // előtöltjük auth emailből
          setForm(f => ({ ...f, email: user.email ?? '' }))
        }
      } catch (e: any) {
        router.push('/register')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  async function geocodeAddress(address: string, forPreview: boolean) {
    if (!address.trim()) return null
    setGeoError(null)
    if (forPreview) setGeoLoading(true)
    try {
      const geoResp = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim() }),
      })

      const geo = await geoResp.json()
      if (geoResp.status !== 200 || geo.error) {
        throw new Error(geo?.error || 'Cím geokódolás sikertelen.')
      }

      const result = {
        lat: geo.lat,
        lng: geo.lng,
        formatted: geo.formatted_address ?? null,
        address: address.trim(),
      }

      if (forPreview) setGeoPreview(result)
      if (forPreview) {
        setPickedLocation(current => {
          if (current?.source === 'manual') return current
          return { lat: result.lat, lng: result.lng, source: 'geo' }
        })
      }
      return result
    } catch (e: any) {
      if (forPreview) setGeoError(e?.message ?? 'Hiba')
      throw e
    } finally {
      if (forPreview) setGeoLoading(false)
    }
  }

  async function save() {
    setMsg(null)
    setSaving(true)
    try {
      const user = await requireUser()

      // MVP: lat/lng majd holnap (most csak cím)
      const trimmedAddress = form.address.trim()
      const cached = geoPreview?.address === trimmedAddress ? geoPreview : null
      let fallbackGeo = cached
      if (!fallbackGeo) {
        try {
          fallbackGeo = await geocodeAddress(trimmedAddress, false)
        } catch (e) {
          if (!pickedLocation) throw e
        }
      }

      const geo = pickedLocation ?? (fallbackGeo ? { ...fallbackGeo, source: 'geo' } : null)

      const payload = {
        user_id: user.id,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: trimmedAddress,
        felir_number: form.felir_number.trim(),
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      }

      const normalizedPhone = payload.phone.replace(/[\s-]/g, '')
      if (!/^(\+36|06|0036)\d{7,}$/.test(normalizedPhone)) {
        throw new Error('A telefonszám formátuma hibás. +36, 06 vagy 0036 kezdet kötelező.')
      }
      if (!/^[A-Za-z]{2}\d{7}$/.test(payload.felir_number)) {
        throw new Error('A FELIR szám formátuma hibás (2 betu + 7 szam).')
      }
      if (!payload.name || !payload.email || !payload.phone || !payload.address || !payload.felir_number) {
        throw new Error('Minden mező kötelező.')
      }
      if (payload.lat == null || payload.lng == null) {
        throw new Error('Jelöld meg a helyet a térképen.')
      }

      const { data, error } = await supabaseBrowser
        .from('tenants')
        .upsert(payload, { onConflict: 'user_id' })
        .select('id')
        .single()

      if (error) throw error
      setTenantId(data.id)
      setMsg('Mentve.')
      router.push('/farmer/products')
    } catch (e: any) {
      setMsg(e?.message ?? 'Hiba')
    } finally {
      setSaving(false)
    }
  }


  if (loading) {
    return (
      <main className="page">
        <div className="container">
          <section className="card">Betöltés…</section>
        </div>
      </main>
    )
  }

  const previewCenter = geoPreview ? { lat: geoPreview.lat, lng: geoPreview.lng } : null
  const pickedCenter = pickedLocation ? { lat: pickedLocation.lat, lng: pickedLocation.lng } : null
  const mapCenter = pickedCenter ?? previewCenter ?? hungaryCenter
  const markerCenter = pickedCenter ?? previewCenter
  const mapZoom = pickedCenter ? 13 : previewCenter ? 11 : 7

  return (
    <main className="page">
      <div className="container">
        <header className="page-header">
          <span className="eyebrow">Gazdaság</span>
          <h1>Profil</h1>
          <div className="meta">
            <div>Email: {form.email}</div>
            <div>FELIR: {form.felir_number}</div>
          </div>
        </header>

        <section className="card form-grid">
          <label className="field">
            <span>Gazdaság neve</span>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Telefon</span>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="field">
            <span>Cím</span>
            <input
              value={form.address}
              onChange={e => {
                setForm({ ...form, address: e.target.value })
                setGeoPreview(null)
                setGeoError(null)
                setPickedLocation(current => (current?.source === 'geo' ? null : current))
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  if (form.address.trim().length < 6) return
                  geocodeAddress(form.address, true).catch(() => {})
                }
              }}
              onBlur={() => {
                if (skipNextGeocodeRef.current) {
                  skipNextGeocodeRef.current = false
                  return
                }
                if (form.address.trim().length < 6) return
                geocodeAddress(form.address, true).catch(() => {})
              }}
            />
          </label>
          {geoLoading && <p className="notice">Helyszín keresése…</p>}
          {geoError && <p className="notice">{geoError}</p>}
          <div className="map-preview">
            {geoPreview && (
              <p className="meta">
                Találat:{' '}
                <span
                  className="link-text"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    skipNextGeocodeRef.current = true
                    setForm(f => ({ ...f, address: geoPreview.formatted ?? geoPreview.address }))
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      skipNextGeocodeRef.current = true
                      setForm(f => ({ ...f, address: geoPreview.formatted ?? geoPreview.address }))
                    }
                  }}
                >
                  {geoPreview.formatted ?? geoPreview.address}
                </span>
                {pickedLocation?.source === 'manual' && ' · Kézzel kijelölt pin'}
              </p>
            )}
            <MapPicker
              center={mapCenter}
              zoom={mapZoom}
              marker={markerCenter}
              onPick={(lat, lng) => setPickedLocation({ lat, lng, source: 'manual' })}
            />
          </div>
          <button disabled={saving} onClick={save}>
            {saving ? 'Mentés…' : 'Adatok frissítése'}
          </button>

          {msg && <p className="notice">{msg}</p>}
        </section>
      </div>
    </main>
  )
}
