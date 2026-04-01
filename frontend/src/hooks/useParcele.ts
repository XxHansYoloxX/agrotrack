import { useCallback, useEffect, useState } from 'react'
import type { Parcela } from '../types'

export function useParcele() {
  const [parcele, setParcele] = useState<Parcela[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/parcele')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<Parcela[]>
      })
      .then(setParcele)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [tick])

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  return { parcele, loading, error, refetch }
}
