'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { useRouter, useSearchParams } from 'next/navigation'

type LatLng = { lat: number; lng: number; source: 'geo' | 'manual' }

const hungaryCenter = { lat: 47.1625, lng: 19.5033 }

const MapPicker = dynamic(() => import('@/app/components/MapPicker'), { ssr: false })

function RegisterForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const [farmName, setFarmName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [felir, setFelir] = useState('')
  const [felirConsent, setFelirConsent] = useState(false)
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [termsConsent, setTermsConsent] = useState(false)
  const [geoPreview, setGeoPreview] = useState<{ lat: number; lng: number; formatted: string | null; address: string } | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [pickedLocation, setPickedLocation] = useState<LatLng | null>(null)
  const skipNextGeocodeRef = useRef(false)

  useEffect(() => {
    const initialMode = searchParams.get('mode')
    if (initialMode === 'signin' || initialMode === 'signup') {
      setMode(initialMode)
    }
  }, [searchParams])

  async function geocodeAddress(addr: string, forPreview: boolean) {
    if (!addr.trim()) return null
    setGeoError(null)
    if (forPreview) setGeoLoading(true)
    try {
      const geoResp = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr.trim() }),
      })

      const geo = await geoResp.json()
      if (geoResp.status !== 200 || geo.error) {
        throw new Error(geo?.error || 'Cím geokódolás sikertelen.')
      }

      const result = {
        lat: geo.lat,
        lng: geo.lng,
        formatted: geo.formatted_address ?? null,
        address: addr.trim(),
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)
    try {
      if (mode === 'signup') {
  const trimmedAddress = address.trim()
  const normalizedPhone = phone.replace(/[\s-]/g, '')

  if (!farmName.trim() || !email.trim() || !phone.trim() || !trimmedAddress || !felir.trim()) {
    throw new Error('Minden mező kötelező.')
  }
  if (!felirConsent) throw new Error('A FELIR nyilatkozat elfogadása kötelező.')
  if (!privacyConsent) throw new Error('Az adatkezelési tájékoztató elfogadása kötelező.')
  if (!termsConsent) throw new Error('Az ÁSZF elfogadása kötelező.')

  if (!/^(\+36|06|0036)\d{7,}$/.test(normalizedPhone)) {
    throw new Error('A telefonszám formátuma hibás. +36, 06 vagy 0036 kezdet kötelező.')
  }
  if (!/^[A-Za-z]{2}\d{7}$/.test(felir.trim())) {
    throw new Error('A FELIR szám formátuma hibás (2 betű + 7 szám).')
  }

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
  if (!geo) throw new Error('Jelöld meg a helyet a térképen.')

  // ✅ 1) saját register API (server oldalon user+tenant)
  const resp = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: farmName.trim(),
      email: email.trim(),
      phone: normalizedPhone, // javasolt normalizáltan menteni
      address: fallbackGeo?.formatted || trimmedAddress,
      felir_number: felir.trim().toUpperCase(),
      lat: geo.lat,
      lng: geo.lng,
      password,

      // opcionális: consent audit (ha akarod tárolni)
      consents: {
        felir: true,
        privacy: true,
        terms: true,
        ts: new Date().toISOString(),
      },
    }),
  })

  const j = await resp.json()
  if (!resp.ok) throw new Error(j?.error ?? 'Regisztráció sikertelen.')

  setMsg('Regisztráció kész. Ellenőrizd az emailedet a megerősítéshez.')
  setMode('signin')
  return
      } else {
        const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/farmer/profile')
      }
    } catch (err: any) {
      setMsg(err?.message ?? 'Hiba')
    } finally {
      setLoading(false)
    }
  }

  const previewCenter = geoPreview ? { lat: geoPreview.lat, lng: geoPreview.lng } : null
  const pickedCenter = pickedLocation ? { lat: pickedLocation.lat, lng: pickedLocation.lng } : null
  const mapCenter = pickedCenter ?? previewCenter ?? hungaryCenter
  const markerCenter = pickedCenter ?? previewCenter
  const mapZoom = pickedCenter ? 13 : previewCenter ? 11 : 7

  return (
    <main className="page">
      <div className="container container-narrow">
        <header className="page-header">
          <span className="eyebrow">Gazda hozzáférés</span>
          <h1>{mode === 'signup' ? 'Regisztráció' : 'Bejelentkezés'}</h1>
          <p>Hozz létre fiókot, vagy lépj be a gazdai felületre.</p>
        </header>

        <form onSubmit={handleSubmit} className="card form-grid">
          <label className="field">
            <span>Email</span>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" required />
          </label>
          <label className="field">
            <span>Jelszó</span>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" required />
          </label>

          {mode === 'signup' && (
            <>
              <label className="field">
                <span>Gazdaság neve</span>
                <input value={farmName} onChange={e => setFarmName(e.target.value)} />
              </label>
              <label className="field">
                <span>Telefon</span>
                <input value={phone} onChange={e => setPhone(e.target.value)} />
              </label>
              <label className="field">
                <span>Cím</span>
                <input
                  value={address}
                  onChange={e => {
                    setAddress(e.target.value)
                    setGeoPreview(null)
                    setGeoError(null)
                    setPickedLocation(current => (current?.source === 'geo' ? null : current))
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      if (address.trim().length < 6) return
                      geocodeAddress(address, true).catch(() => {})
                    }
                  }}
                  onBlur={() => {
                    if (skipNextGeocodeRef.current) {
                      skipNextGeocodeRef.current = false
                      return
                    }
                    if (address.trim().length < 6) return
                    geocodeAddress(address, true).catch(() => {})
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
                        setAddress(geoPreview.formatted ?? geoPreview.address)
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          skipNextGeocodeRef.current = true
                          setAddress(geoPreview.formatted ?? geoPreview.address)
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
              <label className="field">
                <span>FELIR szám</span>
                <input value={felir} onChange={e => setFelir(e.target.value)} />
              </label>
              <label className="field checkbox-field">
                <span>
                  Büntetőjogi felelősségem tudatában kijelentem, hogy az általam megadott FELIR
                  azonosító a saját gazdaságomhoz tartozik, annak használatára jogosult vagyok, és
                  a megadott adat a valóságnak megfelel.
                </span>
                <input
                  type="checkbox"
                  checked={felirConsent}
                  onChange={e => setFelirConsent(e.target.checked)}
                  required
                />
              </label>
              <label className="field checkbox-field">
                <span>
                  <a className="link-text" href="/privacy_policy.html" target="_blank" rel="noreferrer">
                    Az Adatkezelési Tájékoztatót
                  </a>{' '}
                  elolvastam és elfogadom.
                </span>
                <input
                  type="checkbox"
                  checked={privacyConsent}
                  onChange={e => setPrivacyConsent(e.target.checked)}
                  required
                />
              </label>
              <label className="field checkbox-field">
                <span>
                  <a className="link-text" href="/aszf_gazda.html" target="_blank" rel="noreferrer">
                    Az ÁSZF-et
                  </a>{' '}
                  elolvastam és elfogadom.
                </span>
                <input
                  type="checkbox"
                  checked={termsConsent}
                  onChange={e => setTermsConsent(e.target.checked)}
                  required
                />
              </label>
            </>
          )}

          <button disabled={loading} type="submit">
            {loading ? '...' : mode === 'signup' ? 'Regisztrálok' : 'Belépek'}
          </button>

          <button
            className="button-secondary"
            type="button"
            onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
          >
            {mode === 'signup' ? 'Van már fiókom → Belépés' : 'Nincs fiókom → Regisztráció'}
          </button>

          {msg && <p className="notice">{msg}</p>}
        </form>
      </div>
    </main>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<main className="page"><div className="container container-narrow"><section className="card">Betöltés…</section></div></main>}>
      <RegisterForm />
    </Suspense>
  )
}
