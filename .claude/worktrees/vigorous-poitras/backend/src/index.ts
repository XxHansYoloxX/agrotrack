import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT ?? 3000

app.use(cors())
app.use(express.json())

// Health check
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() })
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' })
  }
})

// Kmetije
app.get('/api/kmetije', async (_req, res) => {
  const kmetije = await prisma.kmetija.findMany()
  res.json(kmetije)
})

// Parcele — vračamo tudi centroid meje kot GeoJSON
app.get('/api/parcele', async (_req, res) => {
  const rows = await prisma.$queryRaw<
    {
      id: string
      naziv: string
      gmid: string | null
      povrsina: number
      kultura: string | null
      geojson: string | null
    }[]
  >`
    SELECT
      p.id,
      p.naziv,
      p.gmid,
      p.povrsina::float,
      p.kultura,
      ST_AsGeoJSON(p.meja)::text AS geojson
    FROM parcela p
  `
  const parcele = rows.map((r) => ({
    ...r,
    meja: r.geojson ? JSON.parse(r.geojson) : null,
    geojson: undefined,
  }))
  res.json(parcele)
})

// Delavci
app.get('/api/delavci', async (_req, res) => {
  const delavci = await prisma.delavec.findMany({
    where: { aktiven: true },
    select: { id: true, ime: true, priimek: true, rfidTag: true, kmetijaId: true },
  })
  res.json(delavci)
})

app.listen(PORT, () => {
  console.log(`AgroTrack backend running on http://localhost:${PORT}`)
  console.log(`Health: http://localhost:${PORT}/health`)
})
