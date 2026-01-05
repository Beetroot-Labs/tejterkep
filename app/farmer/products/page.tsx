'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { requireUser } from '@/lib/requireUser'
import { Pencil, Trash2 } from 'lucide-react'

type MilkType = 'RAW' | 'PASTEURIZED'
type Breed =
  | 'MAGYAR_TARKA'
  | 'HOLSTEIN_FRIZ'
  | 'JERSEY'
  | 'BROWN_SWISS'
  | 'MISC'
  | 'GOAT'
  | 'SHEEP'

type ProductRow = {
  id: string
  tenant_id: string
  name: string
  milk_type: MilkType
  breed: Breed | null
  a2: boolean
  price_huf_per_liter: number | null
  active: boolean
}

const breedLabels: Record<Breed, string> = {
  MAGYAR_TARKA: 'Magyar Tarka',
  HOLSTEIN_FRIZ: 'Holstein-Fríz',
  JERSEY: 'Jersey',
  BROWN_SWISS: 'Brown-Swiss',
  MISC: 'Egyéb',
  GOAT: 'Kecske',
  SHEEP: 'Juh',
}

export default function FarmerProductsPage() {
  const router = useRouter()
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [formMsg, setFormMsg] = useState<string | null>(null)
  const [profileComplete, setProfileComplete] = useState(true)
  const [missingFields, setMissingFields] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  const [newName, setNewName] = useState('')
  const [newMilkType, setNewMilkType] = useState<MilkType>('RAW')
  const [newBreed, setNewBreed] = useState<Breed | ''>('')
  const [newA2, setNewA2] = useState(false)
  const [newPrice, setNewPrice] = useState('')
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add')
  const [editingId, setEditingId] = useState<string | null>(null)
  const canAddProduct = Boolean(tenantId && newName.trim() && Number(newPrice) > 0)

  async function load() {
    setMsg(null)
    setLoading(true)
    try {
      const user = await requireUser()

      const { data: tenant, error: tErr } = await supabaseBrowser
        .from('tenants')
        .select('id,name,email,phone,felir_number,lat,lng')
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

      const { data: prods, error: pErr } = await supabaseBrowser
        .from('milk_products')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })

      if (pErr) throw pErr
      setProducts((prods ?? []) as any)
    } catch (e: any) {
      router.push('/farmer/profile')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addProduct() {
    setFormMsg(null)
    try {
      if (!tenantId) throw new Error('Nincs tenant.')
      if (dialogMode === 'add' && !profileComplete) throw new Error('A profilod hiányos, előbb töltsd ki.')
      if (!newName.trim()) throw new Error('Add meg a termék nevét.')
      if (!newPrice || Number(newPrice) <= 0) throw new Error('Add meg az árat literenként.')

      const price = Number(newPrice)
      const payload = {
        tenant_id: tenantId,
        name: newName.trim(),
        milk_type: newMilkType,
        breed: newBreed === '' ? null : newBreed,
        a2: newA2,
        price_huf_per_liter: price,
        active: true,
      }

      const { error } =
        dialogMode === 'edit' && editingId
          ? await supabaseBrowser.from('milk_products').update(payload).eq('id', editingId)
          : await supabaseBrowser.from('milk_products').insert(payload)

      if (error) throw error
      setNewName('')
      setNewMilkType('RAW')
      setNewBreed('')
      setNewA2(false)
      setNewPrice('')
      setEditingId(null)
      setDialogMode('add')
      await load()
      dialogRef.current?.close()
    } catch (e: any) {
      setFormMsg(e?.message ?? 'Hiba')
    }
  }

  function openDialog() {
    if (!profileComplete) {
      setMsg('A profilod hiányos, előbb töltsd ki a gazda profilt.')
      return
    }
    setFormMsg(null)
    setDialogMode('add')
    setEditingId(null)
    setNewName('')
    setNewMilkType('RAW')
    setNewBreed('')
    setNewA2(false)
    setNewPrice('')
    dialogRef.current?.showModal()
  }

  function closeDialog() {
    dialogRef.current?.close()
  }

  function openEditDialog(product: ProductRow) {
    setFormMsg(null)
    setDialogMode('edit')
    setEditingId(product.id)
    setNewName(product.name)
    setNewMilkType(product.milk_type)
    setNewBreed(product.breed ?? '')
    setNewA2(product.a2)
    setNewPrice(product.price_huf_per_liter ? String(product.price_huf_per_liter) : '')
    dialogRef.current?.showModal()
  }

  async function deleteProduct() {
    if (!editingId) return
    const confirmed = window.confirm('Biztosan törlöd ezt a terméket?')
    if (!confirmed) return
    setFormMsg(null)
    try {
      const { error } = await supabaseBrowser.from('milk_products').delete().eq('id', editingId)
      if (error) throw error
      setEditingId(null)
      setDialogMode('add')
      dialogRef.current?.close()
      await load()
    } catch (e: any) {
      setFormMsg(e?.message ?? 'Hiba')
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

  return (
    <main className="page">
      <div className="container">
        <header className="page-header">
          <span className="eyebrow">Gazdaság</span>
          <div className="split">
            <div>
              <h1>Termékeim</h1>
              <p>Kezeld a termékeidet és frissítsd a készletet.</p>
            </div>
            <button type="button" onClick={openDialog} disabled={!profileComplete}>
              + Új termék hozzáadása
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
          {products.length === 0 && <p className="card">Nincs még terméked.</p>}

          {products.map(p => (
            <div key={p.id} className="card product-card">
              <button
                type="button"
                className="icon-button edit-button"
                aria-label="Termék szerkesztése"
                onClick={() => openEditDialog(p)}
              >
                <Pencil size={18} />
              </button>
              <div className="product-top">
                <div>
                  <h3>{p.name}</h3>
                  <div className="pill-group">
                    <span className="pill">{p.milk_type === 'RAW' ? 'Nyers' : 'Pasztőrözött'}</span>
                    {p.breed && <span className="pill">{breedLabels[p.breed]}</span>}
                    {p.a2 && <span className="pill">A2</span>}
                  </div>
                </div>
                <div className="meta">
                  {p.price_huf_per_liter ? `${p.price_huf_per_liter} Ft/L` : 'Ár nincs megadva'}
                </div>
              </div>

            </div>
          ))}
        </section>
      </div>

      <dialog className="dialog" ref={dialogRef}>
        <div className="dialog-header">
          <h3>{dialogMode === 'edit' ? 'Termék szerkesztése' : 'Új termék'}</h3>
          {dialogMode === 'edit' && (
            <button className="button-danger" type="button" onClick={deleteProduct}>
              <Trash2 size={16} />
              Termék törlése
            </button>
          )}
        </div>
        <div className="form-grid">
          {formMsg && <p className="notice">{formMsg}</p>}
          <label className="field">
            <span>Megnevezés</span>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="pl. Nyers A2 Jersey tej" />
          </label>

          <label className="field">
            <span>Típus</span>
            <select value={newMilkType} onChange={e => setNewMilkType(e.target.value as MilkType)}>
              <option value="RAW">Nyers</option>
              <option value="PASTEURIZED">Pasztőrözött</option>
            </select>
          </label>

          <label className="field">
            <span>Állat/“fajta” (opcionális)</span>
            <select value={newBreed} onChange={e => setNewBreed(e.target.value as any)}>
              <option value="">(nem adom meg)</option>
              {Object.entries(breedLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Ár (Ft/L)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
              placeholder="pl. 400"
            />
          </label>

          <div className="field">
            <span>A2</span>
            <div className="button-row">
              <button
                type="button"
                className={newA2 ? 'button-secondary' : 'button-ghost'}
                onClick={() => setNewA2(true)}
              >
                Igen
              </button>
              <button
                type="button"
                className={!newA2 ? 'button-secondary' : 'button-ghost'}
                onClick={() => setNewA2(false)}
              >
                Nem
              </button>
            </div>
          </div>

          <div className="button-row">
            <button onClick={addProduct} disabled={!canAddProduct}>
              {dialogMode === 'edit' ? 'Mentés' : 'Hozzáadás'}
            </button>
            <button className="button-ghost" type="button" onClick={closeDialog}>
              Mégse
            </button>
          </div>
        </div>
      </dialog>
    </main>
  )
}
