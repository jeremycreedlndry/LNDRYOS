/** Server-side geocoding via Google Maps Geocoding API */
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return null

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`

  try {
    const res = await fetch(url)
    const json = await res.json() as {
      status: string
      results: { geometry: { location: { lat: number; lng: number } } }[]
    }
    if (json.status !== 'OK' || !json.results[0]) return null
    return json.results[0].geometry.location
  } catch {
    return null
  }
}

/** Ray-casting point-in-polygon — checks if [lng, lat] is inside a polygon ring */
export function pointInPolygon(
  lng: number,
  lat: number,
  ring: [number, number][]   // [lng, lat] pairs
): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}
