'use client'

import { useRef, useEffect } from 'react'
import { Input } from './input'

export interface AddressFields {
  street: string
  city: string
  province: string
  postal_code: string
  country: string
  lat?: number
  lng?: number
}

interface Props {
  value: string
  onChange: (raw: string) => void
  onSelect: (fields: AddressFields) => void
  placeholder?: string
}

export function AddressAutocomplete({ value, onChange, onSelect, placeholder }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!inputRef.current || typeof window === 'undefined') return
    if (!(window as unknown as { google?: { maps?: unknown } }).google?.maps) return

    const autocomplete = new (window as unknown as {
      google: {
        maps: {
          places: {
            Autocomplete: new (el: HTMLInputElement, opts: object) => {
              addListener: (event: string, cb: () => void) => void
              getPlace: () => {
                formatted_address?: string
                address_components?: { long_name: string; short_name: string; types: string[] }[]
                geometry?: { location: { lat: () => number; lng: () => number } }
              }
            }
          }
        }
      }
    }).google.maps.places.Autocomplete(inputRef.current, { types: ['address'] })

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (!place.address_components) return

      const get = (type: string, short = false) => {
        const c = place.address_components!.find((c) => c.types.includes(type))
        return c ? (short ? c.short_name : c.long_name) : ''
      }

      onSelect({
        street: `${get('street_number')} ${get('route')}`.trim(),
        city: get('locality') || get('sublocality') || get('administrative_area_level_2'),
        province: get('administrative_area_level_1', true),
        postal_code: get('postal_code'),
        country: get('country'),
        lat: place.geometry?.location.lat(),
        lng: place.geometry?.location.lng(),
      })
      onChange(place.formatted_address ?? '')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? 'Start typing your address…'}
      autoComplete="off"
    />
  )
}
