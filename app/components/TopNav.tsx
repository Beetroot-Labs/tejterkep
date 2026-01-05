'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { LogIn, Menu, X } from 'lucide-react'

export default function TopNav() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    supabaseBrowser.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return
      setIsAuthed(Boolean(data.session))
      if (!data.session) {
        setProfileComplete(null)
        return
      }
      const { data: tenant } = await supabaseBrowser
        .from('tenants')
        .select('name,email,phone,felir_number,lat,lng')
        .eq('user_id', data.session.user.id)
        .maybeSingle()

      if (!isMounted) return
      if (!tenant) {
        setProfileComplete(false)
        setProfileMsg('Töltsd ki a gazda profilt.')
        return
      }

      const missing =
        !tenant.name?.trim() ||
        !tenant.email?.trim() ||
        !tenant.phone?.trim() ||
        !tenant.felir_number?.trim() ||
        tenant.lat == null ||
        tenant.lng == null

      setProfileComplete(!missing)
      setProfileMsg(missing ? 'Töltsd ki a gazda profilt.' : null)
    })

    const { data } = supabaseBrowser.auth.onAuthStateChange(async (_event, session) => {
      setIsAuthed(Boolean(session))
      if (!session) {
        setProfileComplete(null)
        setProfileMsg(null)
        return
      }
      const { data: tenant } = await supabaseBrowser
        .from('tenants')
        .select('name,email,phone,felir_number,lat,lng')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!tenant) {
        setProfileComplete(false)
        setProfileMsg('Töltsd ki a gazda profilt.')
        return
      }

      const missing =
        !tenant.name?.trim() ||
        !tenant.email?.trim() ||
        !tenant.phone?.trim() ||
        !tenant.felir_number?.trim() ||
        tenant.lat == null ||
        tenant.lng == null

      setProfileComplete(!missing)
      setProfileMsg(missing ? 'Töltsd ki a gazda profilt.' : null)
    })

    return () => {
      isMounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  const showGuestNav = isAuthed === false || isAuthed === null

  async function handleSignOut() {
    await supabaseBrowser.auth.signOut()
  }

  return (
    <header className="topbar">
      <Link className="brand" href="/">
        <span className="brand-mark">
          <Image src="/brand-logo.png" alt="TejTérkép logó" width={36} height={36} />
        </span>
        <span>
          <span className="brand-title">TejTérkép</span>
          <span className="brand-subtitle">Friss tej a közeledben</span>
        </span>
      </Link>

      <div className="nav-auth">
        <nav className="nav-links">
          {!showGuestNav && (
            <>
              <Link href="/farmer/profile">Gazdasági profilom</Link>
              {profileComplete ? (
                <>
                  <Link href="/farmer/products">Termékeim</Link>
                  <Link href="/farmer/sales">Értékesítési helyeim</Link>
                </>
              ) : (
                <>
                  <span className="nav-disabled" title={profileMsg ?? 'Töltsd ki a gazda profilt.'}>
                    Termékeim
                  </span>
                  <span className="nav-disabled" title={profileMsg ?? 'Töltsd ki a gazda profilt.'}>
                    Értékesítési helyeim
                  </span>
                </>
              )}
            </>
          )}
        </nav>
        {showGuestNav ? (
          <>
            <Link className="dropdown-button desktop-only" href="/register?mode=signup">
              Termelő vagy? Kerülj fel a térképre!
            </Link>
            <Link className="icon-button mobile-only" href="/register?mode=signin" aria-label="Bejelentkezés">
              <LogIn size={18} />
            </Link>
          </>
        ) : (
          <button className="button-ghost" type="button" onClick={handleSignOut}>
            Kijelentkezés
          </button>
        )}
        <button
          className="icon-button nav-toggle"
          type="button"
          aria-label="Menü"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(v => !v)}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      <div className={`mobile-menu ${mobileOpen ? 'open' : ''}`} onClick={() => setMobileOpen(false)}>
        {showGuestNav ? (
          <>
            <Link href="/register?mode=signin">Bejelentkezés</Link>
            <Link href="/register?mode=signup">Regisztráció</Link>
          </>
        ) : (
          <>
            <Link href="/farmer/profile">Gazdasági profilom</Link>
            {profileComplete ? (
              <>
                <Link href="/farmer/products">Termékeim</Link>
                <Link href="/farmer/sales">Értékesítési helyeim</Link>
              </>
            ) : (
              <>
                <span className="nav-disabled" title={profileMsg ?? 'Töltsd ki a gazda profilt.'}>
                  Termékeim
                </span>
                <span className="nav-disabled" title={profileMsg ?? 'Töltsd ki a gazda profilt.'}>
                  Értékesítési helyeim
                </span>
              </>
            )}
            <button className="button-ghost" type="button" onClick={handleSignOut}>
              Kijelentkezés
            </button>
          </>
        )}
      </div>
    </header>
  )
}
