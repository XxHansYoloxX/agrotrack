import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT ?? 3000

app.use(cors())
app.use(express.json({ limit: '20mb' }))

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

// Iskanje GERK parcel iz lokalne tabele gerk_slovenija
// GET /api/gerk/iskanje?bbox=minLng,minLat,maxLng,maxLat  — prostorsko iskanje
// GET /api/gerk/iskanje?gerk_pids=123,456,789             — po GERK_PID
app.get('/api/gerk/iskanje', async (req, res) => {
  try {
    const { bbox, gerk_pids } = req.query as { bbox?: string; gerk_pids?: string }

    if (!bbox && !gerk_pids) {
      res.status(400).json({ error: 'Podan mora biti parameter bbox ali gerk_pids.' })
      return
    }

    type GerkRow = {
      gerk_pid: string
      raba_id: number | null
      area_m2: number
      opis_rabe: string | null
      geojson: string
    }

    let rows: GerkRow[]

    if (gerk_pids) {
      const pidList = gerk_pids.split(',').map((p) => parseInt(p.trim(), 10)).filter(Boolean)
      if (!pidList.length) { res.json({ type: 'FeatureCollection', features: [] }); return }
      rows = await prisma.$queryRaw<GerkRow[]>`
        SELECT gerk_pid::text, raba_id, area_m2::float, opis_rabe,
               ST_AsGeoJSON(geometrija)::text AS geojson
        FROM gerk_slovenija
        WHERE gerk_pid = ANY(${pidList}::bigint[])
      `
    } else {
      const parts = (bbox as string).split(',').map(Number)
      if (parts.length !== 4 || parts.some(isNaN)) {
        res.status(400).json({ error: 'bbox mora biti: minLng,minLat,maxLng,maxLat' })
        return
      }
      const [minLng, minLat, maxLng, maxLat] = parts
      rows = await prisma.$queryRaw<GerkRow[]>`
        SELECT gerk_pid::text, raba_id, area_m2::float, opis_rabe,
               ST_AsGeoJSON(geometrija)::text AS geojson
        FROM gerk_slovenija
        WHERE geometrija && ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
        LIMIT 300
      `
    }

    const features = rows.map((r) => ({
      type: 'Feature' as const,
      properties: {
        gerk_pid: r.gerk_pid,
        raba_id: r.raba_id,
        area_m2: r.area_m2,
        opis_rabe: r.opis_rabe,
      },
      geometry: JSON.parse(r.geojson),
    }))

    res.json({ type: 'FeatureCollection', features })
  } catch (e) {
    console.error('Napaka pri iskanju GERK:', e)
    res.status(500).json({ error: 'Interna napaka strežnika.' })
  }
})

// Dodaj GERK parcelo na kmetijo (iz gerk_slovenija → parcela)
// POST /api/parcele/iz-gerk  { gerk_pid: "123456" }
app.post('/api/parcele/iz-gerk', async (req, res) => {
  try {
    const { gerk_pid } = req.body as { gerk_pid?: string }
    if (!gerk_pid) {
      res.status(400).json({ error: 'Manjka polje gerk_pid.' })
      return
    }

    const kmetija = await prisma.kmetija.findFirst()
    if (!kmetija) {
      res.status(400).json({ error: 'V bazi ni nobene kmetije. Najprej zaženite seed.' })
      return
    }

    type GerkRow = { gerk_pid: string; area_m2: number; opis_rabe: string | null; geojson: string }
    const rows = await prisma.$queryRaw<GerkRow[]>`
      SELECT gerk_pid::text, area_m2::float, opis_rabe,
             ST_AsGeoJSON(geometrija)::text AS geojson
      FROM gerk_slovenija
      WHERE gerk_pid = ${parseInt(gerk_pid, 10)}::bigint
    `
    if (!rows.length) {
      res.status(404).json({ error: `GERK_PID ${gerk_pid} ni najden v gerk_slovenija.` })
      return
    }

    const g = rows[0]
    const povrsina_ha = g.area_m2 / 10000
    const naziv_rabe = g.opis_rabe ?? 'Neznano'
    const naziv = `${naziv_rabe} (GERK ${g.gerk_pid})`
    const geomJson = g.geojson

    await prisma.$executeRaw`
      INSERT INTO parcela (id, kmetija_id, naziv, gmid, povrsina, kultura, meja, created_at, updated_at)
      VALUES (uuid_generate_v4(), ${kmetija.id}::uuid, ${naziv}, ${g.gerk_pid}, ${povrsina_ha}, ${naziv_rabe}, ST_GeomFromGeoJSON(${geomJson}), NOW(), NOW())
      ON CONFLICT (gmid) DO UPDATE SET
        naziv      = EXCLUDED.naziv,
        povrsina   = EXCLUDED.povrsina,
        kultura    = EXCLUDED.kultura,
        meja       = EXCLUDED.meja,
        updated_at = NOW()
    `

    const nova = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM parcela WHERE gmid = ${g.gerk_pid} LIMIT 1
    `

    res.json({ id: nova[0]?.id, gerk_pid: g.gerk_pid, naziv, povrsina_ha, kultura: naziv_rabe })
  } catch (e) {
    console.error('Napaka pri dodajanju GERK parcele:', e)
    res.status(500).json({ error: 'Interna napaka strežnika.' })
  }
})

// Uvoz parcel iz GeoJSON datoteke
app.post('/api/parcele/uvoz-geojson', async (req, res) => {
  try {
    const body = req.body as { type?: string; features?: unknown[] }
    if (!body || body.type !== 'FeatureCollection' || !Array.isArray(body.features)) {
      res.status(400).json({ error: 'Telo zahteve mora biti GeoJSON FeatureCollection.' })
      return
    }

    const kmetija = await prisma.kmetija.findFirst()
    if (!kmetija) {
      res.status(400).json({ error: 'V bazi ni nobene kmetije. Najprej zaženite seed.' })
      return
    }

    type UvozenaP = { gmid: string | null; naziv: string; povrsina_ha: number; naziv_rabe: string }
    const uvozene: UvozenaP[] = []
    let preskocene = 0

    for (const feature of body.features as any[]) {
      const props = feature.properties ?? {}
      const geomOrig = feature.geometry
      if (!geomOrig) { preskocene++; continue }

      // Normalizacija: MultiPolygon → Polygon (vzamemo obroč z največ točkami)
      let geom: { type: string; coordinates: unknown }
      if (geomOrig.type === 'MultiPolygon') {
        const rings: unknown[][] = geomOrig.coordinates as unknown[][]
        const biggest = rings.reduce((a: unknown[], b: unknown[]) =>
          (b[0] as unknown[]).length > (a[0] as unknown[]).length ? b : a
        )
        geom = { type: 'Polygon', coordinates: biggest }
      } else if (geomOrig.type === 'Polygon') {
        geom = geomOrig
      } else {
        preskocene++; continue
      }

      const gmid: string | null =
        props.GERK_PID != null ? String(props.GERK_PID) :
        props.gerk_pid != null ? String(props.gerk_pid) :
        props.id        != null ? String(props.id)       : null

      const povrsina_ha = Number(
        props.POVRSINA ?? props.povrsina ?? props.area ?? props.AREA ?? 0
      )
      const naziv_rabe: string = String(
        props.RABA_PRSC ?? props.raba_prsc ?? props.kultura ?? props.RABA ?? props.landuse ?? 'Neznano'
      )
      const naziv: string = String(
        props.naziv ?? props.name ?? props.NAME ?? (gmid ? `GERK ${gmid}` : 'Parcela')
      )
      const geomJson = JSON.stringify(geom)

      if (gmid) {
        await prisma.$executeRaw`
          INSERT INTO parcela (id, kmetija_id, naziv, gmid, povrsina, kultura, meja, created_at, updated_at)
          VALUES (uuid_generate_v4(), ${kmetija.id}::uuid, ${naziv}, ${gmid}, ${povrsina_ha}, ${naziv_rabe}, ST_GeomFromGeoJSON(${geomJson}), NOW(), NOW())
          ON CONFLICT (gmid) DO UPDATE SET
            naziv      = EXCLUDED.naziv,
            povrsina   = EXCLUDED.povrsina,
            kultura    = EXCLUDED.kultura,
            meja       = EXCLUDED.meja,
            updated_at = NOW()
        `
      } else {
        await prisma.$executeRaw`
          INSERT INTO parcela (id, kmetija_id, naziv, gmid, povrsina, kultura, meja, created_at, updated_at)
          VALUES (uuid_generate_v4(), ${kmetija.id}::uuid, ${naziv}, NULL, ${povrsina_ha}, ${naziv_rabe}, ST_GeomFromGeoJSON(${geomJson}), NOW(), NOW())
        `
      }

      uvozene.push({ gmid, naziv, povrsina_ha, naziv_rabe })
    }

    res.json({ uvozene: uvozene.length, preskocene, parcele: uvozene })
  } catch (e) {
    console.error('Napaka pri uvozu GeoJSON:', e)
    res.status(500).json({ error: 'Interna napaka strežnika pri uvozu.' })
  }
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
