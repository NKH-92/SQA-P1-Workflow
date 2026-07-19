import { useEffect, useState } from 'react'

export type Density = 'comfortable' | 'compact'

function loadDensity(): Density {
  if (typeof localStorage === 'undefined') return 'comfortable'
  try {
    return localStorage.getItem('ui:density') === 'compact' ? 'compact' : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

export function useDensityPreference() {
  const [density, setDensity] = useState<Density>(loadDensity)

  useEffect(() => {
    document.documentElement.dataset.density = density
    try {
      localStorage.setItem('ui:density', density)
    } catch {
      // Storage may be unavailable in privacy-restricted environments.
    }
  }, [density])

  return {
    density,
    toggleDensity: () => setDensity((value) => (value === 'compact' ? 'comfortable' : 'compact')),
  }
}
