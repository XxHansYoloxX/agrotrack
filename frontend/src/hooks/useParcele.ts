import { useEffect, useState } from 'react'
import type { Parcela } from '../types'

export function useParcele() {
  const [parcele, setParcele] = useState<Parcela[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/parcele')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<Parcela[]>
      })
      .then(setParcele)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return { parcele, loading, error }
}
