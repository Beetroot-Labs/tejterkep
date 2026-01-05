'use client'

import { useEffect } from 'react'
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type Center = { lat: number; lng: number }

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function MapUpdater({ center, zoom }: { center: Center; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [center, zoom, map])
  return null
}

function MapResizer() {
  const map = useMap()
  useEffect(() => {
    const tick = () => map.invalidateSize()
    const raf = requestAnimationFrame(tick)
    const timeout = setTimeout(tick, 120)
    const container = map.getContainer()
    const observer = new ResizeObserver(() => {
      map.invalidateSize()
    })
    observer.observe(container)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timeout)
      observer.disconnect()
    }
  }, [map])
  return null
}

export default function MapPicker({
  center,
  zoom,
  marker,
  onPick,
}: {
  center: Center
  zoom: number
  marker: Center | null
  onPick: (lat: number, lng: number) => void
}) {
  return (
    <MapContainer center={center} zoom={zoom} className="map-embed" scrollWheelZoom={false}>
      <MapResizer />
      <MapUpdater center={center} zoom={zoom} />
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onPick={onPick} />
      {marker && (
        <CircleMarker
          center={marker}
          radius={8}
          pathOptions={{ color: '#b45309', fillColor: '#f97316', fillOpacity: 0.9 }}
        />
      )}
    </MapContainer>
  )
}
