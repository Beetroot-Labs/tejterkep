'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { requireUser } from '@/lib/requireUser'
import dynamic from 'next/dynamic'
import { Pencil, Trash2 } from 'lucide-react'

type SalesLocation = {
  id: string
  tenant_id: string
  name: string | null
        address: string
        lat: number
        lng: number
  notes: string | null
}

type LatLng = { lat: number; lng: number; source: 'geo' | 'manual' }

const hungaryCenter = { lat: 47.1625, lng: 19.5033 }

const MapPicker = dynamic(() => import('@/app/components/MapPicker'), { ssr: false })

export default function FarmerSalesPage() {
  const router = useRouter()

  const [tenantId, setTenantId] = useState<string | null>(null)
  const [locations, setLocations] = useState<SalesLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [locMsg, setLocMsg] = useState<string | null>(null)
  const [profileComplete, setProfileComplete] = useState(true)
  const [missingFields, setMissingFields] = useState<string[]>([])
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  // új location
  const [locName, setLocName] = useState('')
  const [locAddress, setLocAddress] = useState('')
  const [locNotes, setLocNotes] = useState('')
  const [geoPreview, setGeoPreview] = useState<{ lat: number; lng: number; formatted: string | null; address: string } | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [pickedLocation, setPickedLocation] = useState<LatLng | null>(null)
  const skipNextGeocodeRef = useRef(false)
  const [locDialogMode, setLocDialogMode] = useState<'add' | 'edit'>('add')
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)

  async function loadAll() {
    setMsg(null)
    setLoading(true)
    try {
      const user = await requireUser()

      const { data: tenant, error: tErr } = await supabaseBrowser
        .from('tenants')
        .select('id,address,name,email,phone,felir_number,lat,lng')
        .eq('user_id', user.id)
        .single()

      if (tErr) throw tErr
      setTenantId(tenant.id)
      const missing: string[] = []
      if (!tenant.name?.trim()) missing.push('Gazdaság neve')
      if (!tenant.email?.trim()) missing.push('Email')
      if (!tenant.phone?.trim()) missing.push('Telefon')
      if (!tenant.felir_number?.trim()) missing.push('FELIR szám')
      if (tenant.lat == null || tenant.lng == null) missing.push('Koordináták')
      setMissingFields(missing)
      setProfileComplete(missing.length === 0)

      const { data: locs, error: lErr } = await supabaseBrowser
        .from('sales_locations')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })

      if (lErr) throw lErr
      setLocations((locs ?? []) as any)

      // ha nincs location, előtöltjük az "új location" címet a tenant címével
      setLocAddress(a => a || tenant.address || '')

    } catch (e: any) {
      router.push('/register')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current && !menuButtonRef.current) return
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (menuButtonRef.current?.contains(target)) return
      setOpenMenuId(null)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuId])

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

  async function addLocation() {
    setLocMsg(null)
    try {
      if (!tenantId) throw new Error('Nincs tenant.')
      if (locDialogMode === 'add' && !profileComplete) throw new Error('A profilod hiányos, előbb töltsd ki.')
      if (!locAddress.trim()) throw new Error('A cím kötelező.')

      const cached = geoPreview?.address === locAddress.trim() ? geoPreview : null
      let fallbackGeo = cached
      if (!fallbackGeo) {
        try {
          fallbackGeo = await geocodeAddress(locAddress, false)
        } catch (e) {
          if (!pickedLocation) throw e
        }
      }

      const geo = pickedLocation ?? (fallbackGeo ? { ...fallbackGeo, source: 'geo' } : null)
      if (!geo) throw new Error('Cím geokódolás sikertelen.')

      const payload = {
        tenant_id: tenantId,
        name: locName.trim() || null,
        address: fallbackGeo?.formatted || locAddress.trim(),
        lat: geo.lat,
        lng: geo.lng,
        notes: locNotes.trim() || null,
      }

      const { error } =
        locDialogMode === 'edit' && editingLocationId
          ? await supabaseBrowser.from('sales_locations').update(payload).eq('id', editingLocationId)
          : await supabaseBrowser.from('sales_locations').insert(payload)
      if (error) throw error

      setLocName('')
      setLocNotes('')
      setGeoPreview(null)
      setPickedLocation(null)
      setEditingLocationId(null)
      setLocDialogMode('add')
      // címet hagyjuk, mert sokszor ugyanaz lesz
      await loadAll()
      dialogRef.current?.close()
    } catch (e: any) {
      setLocMsg(e?.message ?? 'Hiba')
    }
  }

  function openDialog() {
    if (!profileComplete) {
      setMsg('A profilod hiányos, előbb töltsd ki a gazda profilt.')
      return
    }
    setLocMsg(null)
    setGeoError(null)
    setLocDialogMode('add')
    setEditingLocationId(null)
    setLocName('')
    setLocNotes('')
    setGeoPreview(null)
    setPickedLocation(null)
    dialogRef.current?.showModal()
  }

  function closeDialog() {
    dialogRef.current?.close()
  }

  function openEditDialog(location: SalesLocation) {
    setLocMsg(null)
    setGeoError(null)
    setLocDialogMode('edit')
    setEditingLocationId(location.id)
    setLocName(location.name ?? '')
    setLocAddress(location.address ?? '')
    setLocNotes(location.notes ?? '')
    setGeoPreview(null)
    setPickedLocation({ lat: (location as any).lat, lng: (location as any).lng, source: 'manual' })
    dialogRef.current?.showModal()
  }


  async function deleteLocationWithConfirm() {
    if (!editingLocationId) return
    const confirmed = window.confirm('Biztosan törlöd ezt az értékesítési helyet?')
    if (!confirmed) return
    setLocMsg(null)
    try {
      const { error } = await supabaseBrowser.from('sales_locations').delete().eq('id', editingLocationId)
      if (error) throw error
      setEditingLocationId(null)
      setLocDialogMode('add')
      dialogRef.current?.close()
      await loadAll()
    } catch (e: any) {
      setLocMsg(e?.message ?? 'Hiba')
    }
  }

  const previewCenter = geoPreview ? { lat: geoPreview.lat, lng: geoPreview.lng } : null
  const pickedCenter = pickedLocation ? { lat: pickedLocation.lat, lng: pickedLocation.lng } : null
  const mapCenter = pickedCenter ?? previewCenter ?? hungaryCenter
  const markerCenter = pickedCenter ?? previewCenter
  const mapZoom = pickedCenter ? 13 : previewCenter ? 11 : 7

  if (loading) {
    return (
      <main className="page">
        <div className="container">
          <section className="card">Betöltés…</section>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="container">
        <header className="page-header">
          <span className="eyebrow">Gazda felület</span>
          <div className="split">
            <div>
              <h1>Értékesítési helyek és időpontok</h1>
              <p>Add meg, hol és mikor vehető át a friss tej.</p>
            </div>
            <button type="button" onClick={openDialog} disabled={!profileComplete}>
              + Új hely hozzáadása
            </button>
          </div>
        </header>

        {(!profileComplete || msg) && (
          <p className="notice">
            {!profileComplete
              ? `A profilod hiányos (${missingFields.join(', ')}). Töltsd ki a gazda profilt.`
              : msg}
          </p>
        )}

        <section className="grid">
          <h3>Helyek és időpontok</h3>
          {locations.length === 0 ? (
            <p className="card">Még nincs értékesítési helyed.</p>
          ) : (
            <div className="grid">
              {locations.map(l => (
                <div key={l.id} className="card product-card">
                  <div className="menu-wrapper">
                    <button
                      type="button"
                      className="icon-button edit-button"
                      aria-label="Műveletek"
                      aria-haspopup="menu"
                      aria-expanded={openMenuId === l.id}
                      onClick={() => setOpenMenuId(prev => (prev === l.id ? null : l.id))}
                      ref={openMenuId === l.id ? menuButtonRef : null}
                    >
                      <Pencil size={18} />
                    </button>
                    {openMenuId === l.id && (
                      <div className="context-menu" role="menu" ref={menuRef}>
                        <button
                          type="button"
                          className="context-item"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuId(null)
                            openEditDialog(l)
                          }}
                        >
                          Hely szerkesztése
                        </button>
                    </div>
                  )}
                </div>
                <div className="product-top">
                  <div className="info-block">
                    <strong>{l.name || 'Értékesítési hely'}</strong>
                    <span className="meta">{l.address}</span>
                    {l.notes && <span className="meta">{l.notes}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

        <dialog className="dialog" ref={dialogRef}>
          <div className="dialog-header">
            <h3>{locDialogMode === 'edit' ? 'Hely szerkesztése' : 'Új értékesítési hely'}</h3>
            {locDialogMode === 'edit' && (
              <button className="button-danger" type="button" onClick={deleteLocationWithConfirm}>
                <Trash2 size={16} />
                Hely törlése
              </button>
            )}
          </div>
          <div className="form-grid">
            {locMsg && <p className="notice">{locMsg}</p>}
            <label className="field">
              <span>Megnevezés</span>
              <input value={locName} onChange={e => setLocName(e.target.value)} placeholder="pl. Gazdaság / Piac" />
            </label>
            <label className="field">
              <span>Cím</span>
              <input
                value={locAddress}
                onChange={e => {
                  setLocAddress(e.target.value)
                  setGeoPreview(null)
                  setGeoError(null)
                  setPickedLocation(current => (current?.source === 'geo' ? null : current))
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    if (locAddress.trim().length < 6) return
                    geocodeAddress(locAddress, true).catch(() => {})
                  }
                }}
                onBlur={() => {
                  if (skipNextGeocodeRef.current) {
                    skipNextGeocodeRef.current = false
                    return
                  }
                  if (locAddress.trim().length < 6) return
                  geocodeAddress(locAddress, true).catch(() => {})
                }}
                placeholder="település, utca, házszám"
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
                      setLocAddress(geoPreview.formatted ?? geoPreview.address)
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        skipNextGeocodeRef.current = true
                        setLocAddress(geoPreview.formatted ?? geoPreview.address)
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
              <span>Megjegyzés</span>
              <textarea
                value={locNotes}
                onChange={e => setLocNotes(e.target.value)}
                placeholder="pl. nyitvatartás, kapucsengő, parkolás"
                rows={3}
              />
            </label>
            <div className="button-row">
              <button onClick={addLocation} disabled={!tenantId || !locAddress.trim()}>
                {locDialogMode === 'edit' ? 'Mentés' : 'Hely hozzáadása'}
              </button>
              <button className="button-ghost" type="button" onClick={closeDialog}>
                Mégse
              </button>
            </div>
          </div>
        </dialog>
      </div>
    </main>
  )
}
