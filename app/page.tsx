'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { List } from 'lucide-react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

const BuyerMap = dynamic(() => import('@/app/components/BuyerMap').then(mod => mod.BuyerMap), { ssr: false })

type Row = any

export default function HomePage() {
  const breedLabels: Record<string, string> = {
    MAGYAR_TARKA: 'Magyar Tarka',
    HOLSTEIN_FRIZ: 'Holstein-Fríz',
    JERSEY: 'Jersey',
    BROWN_SWISS: 'Brown-Swiss',
    MISC: 'Egyéb',
    GOAT: 'Kecske',
    SHEEP: 'Juh',
  }
  const defaultCenter = { lat: 47.1625, lng: 19.5033 }
  const [address, setAddress] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [allRows, setAllRows] = useState<Row[]>([])
  const [allLoading, setAllLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [selected, setSelected] = useState<any | null>(null)
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)
  const lastSearchKeyRef = useRef<string | null>(null)
  const [mapZoom, setMapZoom] = useState(11)
  const [mapKey, setMapKey] = useState('default')
  const [mapDefaultCenter, setMapDefaultCenter] = useState(defaultCenter)
  const [breedFilter, setBreedFilter] = useState('all')
  const [milkTypeFilter, setMilkTypeFilter] = useState('all')
  const [a2Only, setA2Only] = useState(false)
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    let isMounted = true
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (isMounted) setIsAuthed(Boolean(data.session))
    })
    const { data } = supabaseBrowser.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(Boolean(session))
    })
    return () => {
      isMounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    function updateIsMobile() {
      setIsMobile(window.matchMedia('(max-width: 720px)').matches)
    }
    updateIsMobile()
    window.addEventListener('resize', updateIsMobile)
    return () => window.removeEventListener('resize', updateIsMobile)
  }, [])

  useEffect(() => {
    let isMounted = true
    async function loadAllListings() {
      try {
        const { data, error } = await supabaseBrowser
          .from('public_listings')
          .select('*')
        if (error) throw error
        if (isMounted) {
          setAllRows(data ?? [])
          if (rows.length === 0) setRows(data ?? [])
        }
      } catch (e: any) {
        if (isMounted) setMsg(e?.message ?? 'Hiba')
      } finally {
        if (isMounted) setAllLoading(false)
      }
    }

    loadAllListings()
    return () => {
      isMounted = false
    }
  }, [rows.length])

  const breedOptions = useMemo(() => {
    const set = new Set<string>()
    allRows.forEach((row: any) => {
      if (row.breed) set.add(String(row.breed))
    })
    return Array.from(set).sort()
  }, [allRows])

  const filteredRows = useMemo(() => {
    return rows.filter((row: any) => {
      if (milkTypeFilter !== 'all' && row.milk_type !== milkTypeFilter) return false
      if (breedFilter !== 'all' && String(row.breed) !== breedFilter) return false
      if (a2Only && !row.a2) return false
      return true
    })
  }, [rows, milkTypeFilter, breedFilter, a2Only])

  const filteredAllRows = useMemo(() => {
    return allRows.filter((row: any) => {
      if (milkTypeFilter !== 'all' && row.milk_type !== milkTypeFilter) return false
      if (breedFilter !== 'all' && String(row.breed) !== breedFilter) return false
      if (a2Only && !row.a2) return false
      return true
    })
  }, [allRows, milkTypeFilter, breedFilter, a2Only])

  async function searchByCoords(
    lat: number,
    lng: number,
    force = false,
    recenter = true,
  ) {
    const key = `${lat.toFixed(5)}:${lng.toFixed(5)}`
    if (!force && lastSearchKeyRef.current === key) return
    lastSearchKeyRef.current = key
    setMsg(null)
    setLoading(true)
    try {
      setCenter({ lat, lng })
      setMapDefaultCenter({ lat, lng })
      if (recenter) {
        setMapKey(key)
      }
      const { data, error } = await supabaseBrowser.rpc('search_listings', {
        q_lat: lat,
        q_lng: lng,
        radius_m: 1000000,
      })
      if (error) throw error

      setRows((data ?? []).slice(0, 50))
      setSelected(null)
      if (!data?.length) setMsg('Nincs találat ebben a körzetben.')
    } catch (e: any) {
      setMsg(e?.message ?? 'Hiba')
    } finally {
      setLoading(false)
    }
  }

  async function search() {
    setMsg(null)
    setLoading(true)
    try {
      const addr = address.trim()
      if (!addr) throw new Error('Add meg a címet / települést.')

      const geoResp = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      })
      const geo = await geoResp.json()
      if (!geoResp.ok) throw new Error(geo?.error ?? 'Geocode failed')

      await searchByCoords(geo.lat, geo.lng, true, true)
    } catch (e: any) {
      setMsg(e?.message ?? 'Hiba')
      setLoading(false)
    }
  }

  async function useMyLocation() {
    setMsg(null)
    setLoading(true)
    try {
      if (!navigator.geolocation) {
        throw new Error('A böngésződ nem támogatja a helymeghatározást.')
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      })

      const lat = position.coords.latitude
      const lng = position.coords.longitude
      await searchByCoords(lat, lng, true, true)
    } catch (e: any) {
      setMsg(e?.message ?? 'Hiba')
    }
  }

  const showGuestLayout = isAuthed !== true
  const showPanel = !showGuestLayout || !isMobile || mobilePanelOpen

  const groupedLocations = useMemo(() => {
    const groups = new Map<string, any>()
    filteredRows.forEach((x: any) => {
      const key = x.sales_location_id ?? `tenant-${x.tenant_id}`
      const existing = groups.get(key)
      const locationLat = x.sales_location_lat ?? x.tenant_lat
      const locationLng = x.sales_location_lng ?? x.tenant_lng
      if (!existing) {
        groups.set(key, {
          key,
          tenant_id: x.tenant_id,
          tenant_name: x.tenant_name,
          tenant_felir_number: x.tenant_felir_number,
          phone: x.phone,
          location_name: x.sales_location_name ?? null,
          location_address: x.sales_location_address ?? x.tenant_address,
          location_notes: x.sales_location_notes ?? null,
          lat: locationLat,
          lng: locationLng,
          distance_m: x.distance_m ?? null,
          products: [],
        })
      }
      const group = groups.get(key)
      group.products.push({
        product_id: x.product_id,
        product_name: x.product_name,
        milk_type: x.milk_type,
        breed: x.breed,
        a2: x.a2,
        price_huf_per_liter: x.price_huf_per_liter,
      })
      if (x.distance_m != null) {
        group.distance_m =
          group.distance_m == null ? x.distance_m : Math.min(group.distance_m, x.distance_m)
      }
    })
    return Array.from(groups.values())
  }, [filteredRows])

  const groupedAllLocations = useMemo(() => {
    const groups = new Map<string, any>()
    filteredAllRows.forEach((x: any) => {
      const key = x.sales_location_id ?? `tenant-${x.tenant_id}`
      const existing = groups.get(key)
      const locationLat = x.sales_location_lat ?? x.tenant_lat
      const locationLng = x.sales_location_lng ?? x.tenant_lng
      if (!existing) {
        groups.set(key, {
          key,
          tenant_id: x.tenant_id,
          tenant_name: x.tenant_name,
          tenant_felir_number: x.tenant_felir_number,
          phone: x.phone,
          location_name: x.sales_location_name ?? null,
          location_address: x.sales_location_address ?? x.tenant_address,
          location_notes: x.sales_location_notes ?? null,
          lat: locationLat,
          lng: locationLng,
          distance_m: x.distance_m ?? null,
          products: [],
        })
      }
      const group = groups.get(key)
      group.products.push({
        product_id: x.product_id,
        product_name: x.product_name,
        milk_type: x.milk_type,
        breed: x.breed,
        a2: x.a2,
        price_huf_per_liter: x.price_huf_per_liter,
      })
      if (x.distance_m != null) {
        group.distance_m =
          group.distance_m == null ? x.distance_m : Math.min(group.distance_m, x.distance_m)
      }
    })
    return Array.from(groups.values())
  }, [filteredAllRows])

  function selectLocationByRow(row: Row) {
    const key = row.sales_location_id ?? `tenant-${row.tenant_id}`
    const found = groupedAllLocations.find(group => group.key === key)
    setSelected(found ?? null)
  }

  const selectedCenter =
    selected && selected.lat != null && selected.lng != null
      ? { lat: selected.lat, lng: selected.lng }
      : null

  useEffect(() => {
    if (!selectedCenter) return
    const key = `${selectedCenter.lat.toFixed(5)}:${selectedCenter.lng.toFixed(5)}`
    setMapDefaultCenter(selectedCenter)
    setMapKey(key)
    setMapZoom(14)
  }, [selectedCenter?.lat, selectedCenter?.lng])

  useEffect(() => {
    if (selected && mobilePanelOpen) {
      setMobilePanelOpen(false)
    }
  }, [selected, mobilePanelOpen])

  useEffect(() => {
    if (!selected) return
    const stillVisible = groupedAllLocations.some(group => group.key === selected.key)
    if (!stillVisible) setSelected(null)
  }, [groupedAllLocations, selected])


  return (
    <main className={showGuestLayout ? `buyer-shell${!mobilePanelOpen ? ' buyer-fullscreen' : ''}` : 'page'}>
      {showGuestLayout && (
        <div className="buyer-map">
          <BuyerMap
            center={mapDefaultCenter}
            rows={filteredAllRows.length ? filteredAllRows : filteredRows}
            onSelect={selectLocationByRow}
            className="buyer-map-frame"
            mapKey={mapKey}
            zoom={mapZoom}
            onZoomChange={(nextZoom) => setMapZoom(nextZoom)}
            onDragEnd={({ lat, lng }) => {
              if (loading) return
              searchByCoords(lat, lng, false, false)
            }}
            onZoomCenter={({ lat, lng }) => {
              setCenter({ lat, lng })
              setMapDefaultCenter({ lat, lng })
            }}
          />
        </div>
      )}

      {showGuestLayout && isMobile && (
        <button
          className="mobile-list-toggle"
          type="button"
          onClick={() => {
            setSelected(null)
            setMobilePanelOpen(true)
          }}
          aria-label="Lista megnyitása"
        >
          <List size={18} style={{ display: 'block', margin: '0 auto' }} />
        </button>
      )}

      <div
        className={showGuestLayout ? `buyer-panel ${mobilePanelOpen ? 'open' : ''}` : 'container'}
      >
        {showPanel && !selected && (
          <>
            <header className="page-header">
              <span className="eyebrow">Tej a közeledben</span>
              <h1>Keresés a környékeden</h1>
              <p>Add meg a címet és nézd meg, hol kapható friss tej.</p>
            </header>

            <section className="card form-grid">
              <label className="field">
                <span>Cím / település</span>
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="pl. Székesfehérvár" />
              </label>

              <div className="filter-row">
                <label className="field">
                  <span>Fajta</span>
                  <select value={breedFilter} onChange={e => setBreedFilter(e.target.value)}>
                    <option value="all">Összes</option>
                    {breedOptions.map(breed => (
                      <option key={breed} value={breed}>
                        {breedLabels[breed] ?? breed}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Típus</span>
                  <select value={milkTypeFilter} onChange={e => setMilkTypeFilter(e.target.value)}>
                    <option value="all">Összes</option>
                    <option value="RAW">Nyers</option>
                    <option value="PASTEURIZED">Pasztőrözött</option>
                  </select>
                </label>
                <label className="field checkbox-field">
                  <span>A2</span>
                  <input type="checkbox" checked={a2Only} onChange={e => setA2Only(e.target.checked)} />
                </label>
              </div>

              <div className="button-row">
                <button onClick={search} disabled={loading}>
                  {loading ? 'Keresés…' : 'Keresés'}
                </button>
                <button className="button-ghost" onClick={useMyLocation} disabled={loading}>
                  Használd a helyzetem
                </button>
              </div>

              {allLoading && <p className="notice">Termékek betöltése…</p>}
              {msg && <p className="notice">{msg}</p>}
            </section>
          </>
        )}

        {!showGuestLayout && center && rows.length > 0 && (
          <section className="card">
            <BuyerMap
              center={mapDefaultCenter}
              rows={filteredAllRows.length ? filteredAllRows : filteredRows}
              onSelect={selectLocationByRow}
              className="buyer-map-card"
              mapKey={mapKey}
              zoom={mapZoom}
              onZoomChange={(nextZoom) => setMapZoom(nextZoom)}
              onDragEnd={({ lat, lng }) => {
                if (loading) return
                searchByCoords(lat, lng, false, false)
              }}
              onZoomCenter={({ lat, lng }) => {
                setCenter({ lat, lng })
                setMapDefaultCenter({ lat, lng })
              }}
            />
          </section>
        )}

        {showPanel && !selected && (
          <section className="grid">
            {groupedLocations.map((loc: any) => (
              <div
                key={loc.key}
                className="card listing-card"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelected(loc)
                  setMobilePanelOpen(false)
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelected(loc)
                    setMobilePanelOpen(false)
                  }
                }}
              >
                <div className="product-header">
                  <div>
                    <h3 className="product-title">{loc.location_name ?? 'Értékesítési hely'}</h3>
                    <span className="meta">{loc.location_address}</span>
                  </div>
                  {loc.distance_m != null ? (
                    <div className="price-tag">{Math.round(loc.distance_m)} m</div>
                  ) : (
                    <div className="price-tag price-tag-muted">Távolság n/a</div>
                  )}
                </div>

                <div className="listing-body">
                  <div className="listing-block">
                    <span className="meta">Gazdaság</span>
                    <strong>{loc.tenant_name}</strong>
                  </div>
                  <div className="listing-block">
                    <span className="meta">Termékek</span>
                    <div className="product-list">
                      {loc.products.map((p: any) => (
                        <div key={p.product_id} className="product-row">
                          <div>
                            <strong>{p.product_name}</strong>
                            <div className="pill-group">
                              <span className="pill">{p.milk_type === 'RAW' ? 'Nyers' : 'Pasztőrözött'}</span>
                              {p.breed && <span className="pill">{breedLabels[String(p.breed)] ?? String(p.breed)}</span>}
                              {p.a2 && <span className="pill">A2</span>}
                            </div>
                          </div>
                          {p.price_huf_per_liter != null && (
                            <span className="meta">{p.price_huf_per_liter} Ft/L</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="listing-footer">
                  <div className="listing-actions">
                    <a className="phone-link phone-link-inline" href={`tel:${loc.phone}`}>
                      {loc.phone}
                    </a>
                  </div>
                </div>

                {loc.lat != null && loc.lng != null && (
                  <a
                    className="link-text"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`}
                  >
                    Útvonal a Google Maps-ben
                  </a>
                )}
              </div>
            ))}
          </section>
        )}

        {selected && showPanel && (!showGuestLayout || !isMobile) && (
          <section className="card selected-card">
            <div className="selected-header">
              <div>
                <span className="eyebrow">Kiválasztott hely</span>
                <h3 className="selected-title">{selected.location_name ?? 'Értékesítési hely'}</h3>
              </div>
              {selected.distance_m != null && (
                <div className="price-tag">{Math.round(selected.distance_m)} m</div>
              )}
            </div>
            <div className="selected-body">
              <div className="listing-block">
                <span className="meta">Gazdaság</span>
                <strong>{selected.tenant_name}</strong>
              </div>
              {selected.tenant_felir_number && (
                <div className="listing-block">
                  <span className="meta">FELIR</span>
                  <span className="meta">{selected.tenant_felir_number}</span>
                </div>
              )}
              <div className="listing-block">
                <span className="meta">Értékesítési hely</span>
                <span className="meta">{selected.location_address}</span>
              </div>
              {selected.location_notes && (
                <div className="listing-block">
                  <span className="meta">Megjegyzés</span>
                  <span className="meta">{selected.location_notes}</span>
                </div>
              )}
              <div className="listing-block">
                <span className="meta">Termékek</span>
                <div className="selected-products">
                  {selected.products.map((p: any) => (
                    <div key={p.product_id} className="selected-product">
                      <div>
                        <strong>{p.product_name}</strong>
                        <div className="pill-group">
                          <span className="pill">{p.milk_type === 'RAW' ? 'Nyers' : 'Pasztőrözött'}</span>
                              {p.breed && <span className="pill">{breedLabels[String(p.breed)] ?? String(p.breed)}</span>}
                          {p.a2 && <span className="pill">A2</span>}
                        </div>
                      </div>
                      {p.price_huf_per_liter != null && (
                        <span className="meta">{p.price_huf_per_liter} Ft/L</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="selected-actions">
              <a className="phone-link phone-link-inline" href={`tel:${selected.phone}`}>
                {selected.phone}
              </a>
              <a
                className="link-text"
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
              >
                Útvonal a Google Maps-ben
              </a>
            </div>
            <button className="back-link" type="button" onClick={() => setSelected(null)}>
              ← Vissza a listához
            </button>
          </section>
        )}
      </div>

      {showGuestLayout && isMobile && selected && !mobilePanelOpen && (
        <section className="card selected-card selected-bottom">
          <div className="selected-header">
            <div>
              <span className="eyebrow">Kiválasztott hely</span>
              <h3 className="selected-title">{selected.location_name ?? 'Értékesítési hely'}</h3>
            </div>
            {selected.distance_m != null && (
              <div className="price-tag">{Math.round(selected.distance_m)} m</div>
            )}
          </div>
          <div className="selected-body">
            <div className="listing-block">
              <span className="meta">Gazdaság</span>
              <strong>{selected.tenant_name}</strong>
            </div>
            {selected.tenant_felir_number && (
              <div className="listing-block">
                <span className="meta">FELIR</span>
                <span className="meta">{selected.tenant_felir_number}</span>
              </div>
            )}
            <div className="listing-block">
              <span className="meta">Értékesítési hely</span>
              <span className="meta">{selected.location_address}</span>
            </div>
            {selected.location_notes && (
              <div className="listing-block">
                <span className="meta">Megjegyzés</span>
                <span className="meta">{selected.location_notes}</span>
              </div>
            )}
            <div className="listing-block">
              <span className="meta">Termékek</span>
              <div className="selected-products">
                {selected.products.map((p: any) => (
                  <div key={p.product_id} className="selected-product">
                    <div>
                      <strong>{p.product_name}</strong>
                      <div className="pill-group">
                        <span className="pill">{p.milk_type === 'RAW' ? 'Nyers' : 'Pasztőrözött'}</span>
                        {p.breed && <span className="pill">{breedLabels[String(p.breed)] ?? String(p.breed)}</span>}
                        {p.a2 && <span className="pill">A2</span>}
                      </div>
                    </div>
                    {p.price_huf_per_liter != null && (
                      <span className="meta">{p.price_huf_per_liter} Ft/L</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="selected-actions">
            <a className="phone-link phone-link-inline" href={`tel:${selected.phone}`}>
              {selected.phone}
            </a>
            <a
              className="link-text"
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
            >
              Útvonal a Google Maps-ben
            </a>
          </div>
          <button className="back-link" type="button" onClick={() => setSelected(null)}>
            ← Vissza a listához
          </button>
        </section>
      )}
    </main>
  )
}
