import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

let initialised = false
let loadPromise: Promise<void> | null = null

export function loadGoogleMaps(): Promise<void> {
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    if (!initialised) {
      setOptions({
        key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
        v: 'weekly',
      })
      initialised = true
    }

    // Import the libraries we need; each call is a no-op if already loaded
    await Promise.all([
      importLibrary('maps'),
      importLibrary('drawing'),
      importLibrary('geometry'),
      importLibrary('places'),
    ])
  })()

  return loadPromise
}
