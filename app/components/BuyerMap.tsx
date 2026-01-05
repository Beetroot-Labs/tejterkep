'use client'

import { CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type Listing = {
  tenant_id: string
  tenant_name: string
  phone: string
  product_id: string
  product_name: string
  current_liters: number
  price_huf_per_liter: number | null
  distance_m: number

  tenant_lat: number | null
  tenant_lng: number | null
  sales_location_lat: number | null
  sales_location_lng: number | null
  sales_location_address: string | null
  tenant_address: string | null
}

function getPos(x: Listing) {
  if (!x.product_id) return null
  if (x.sales_location_lat == null || x.sales_location_lng == null) return null
  const lat = x.sales_location_lat
  const lng = x.sales_location_lng
  if (lat == null || lng == null) return null
  return { lat, lng }
}

function MapEvents({
  onDragEnd,
  onZoomChange,
  onZoomCenter,
}: {
  onDragEnd?: (center: { lat: number; lng: number }) => void
  onZoomChange?: (zoom: number) => void
  onZoomCenter?: (center: { lat: number; lng: number }) => void
}) {
  useMapEvents({
    dragend(event) {
      if (!onDragEnd) return
      const center = event.target.getCenter()
      onDragEnd({ lat: center.lat, lng: center.lng })
    },
    zoomend(event) {
      if (onZoomCenter) {
        const center = event.target.getCenter()
        onZoomCenter({ lat: center.lat, lng: center.lng })
      }
      if (!onZoomChange) return
      const zoom = event.target.getZoom()
      onZoomChange(zoom)
    },
  })
  return null
}

export function BuyerMap({
  center,
  rows,
  onSelect,
  onDragEnd,
  onZoomChange,
  onZoomCenter,
  className,
  mapKey,
  zoom,
}: {
  center: { lat: number; lng: number }
  rows: Listing[]
  onSelect: (x: Listing) => void
  onDragEnd?: (center: { lat: number; lng: number }) => void
  onZoomChange?: (zoom: number) => void
  onZoomCenter?: (center: { lat: number; lng: number }) => void
  className?: string
  mapKey?: string
  zoom?: number
}) {
  return (
    <div className={className ?? 'buyer-map-card'}>
      <div className="map-center-cross" aria-hidden="true" />
      <MapContainer
        key={mapKey}
        center={center}
        zoom={zoom ?? 11}
        className="buyer-map-leaflet"
        scrollWheelZoom
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEvents onDragEnd={onDragEnd} onZoomChange={onZoomChange} onZoomCenter={onZoomCenter} />
        <CircleMarker
          center={center}
          radius={6}
          pathOptions={{ color: '#dc2626', fillColor: '#f87171', fillOpacity: 0.9 }}
        />
        {rows.map((x) => {
          const pos = getPos(x)
          if (!pos) return null
          return (
            <CircleMarker
              key={`${x.tenant_id}-${x.product_id}-${pos.lat}-${pos.lng}`}
              center={pos}
              radius={7}
              pathOptions={{ color: '#2563eb', fillColor: '#38bdf8', fillOpacity: 0.9 }}
              eventHandlers={{ click: () => onSelect(x) }}
            />
          )
        })}
      </MapContainer>
    </div>
  )
}
