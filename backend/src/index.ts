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
    const { gerk_pid, domace_ime } = req.body as { gerk_pid?: string; domace_ime?: string }
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
    const naziv = domace_ime?.trim() || `${naziv_rabe} (GERK ${g.gerk_pid})`
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

// ---------- GERK po KMG_MID (WFS getFeature prek GWT-RPC) ----------

const GERK_WFS_URL = 'https://rkg.gov.si/GERK/WebViewer/gerk_viewer/wfs_rpc'
const GWT_HEADERS = {
  'Content-Type': 'text/x-gwt-rpc; charset=utf-8',
  'X-GWT-Permutation': 'C69066397C5A681B7A0C4519075AA9B8',
  'X-GWT-Module-Base': 'https://rkg.gov.si/GERK/WebViewer/gerk_viewer/',
}

// GWT Long → Base64 (abeceda: A-Za-z0-9$_)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_'
function encodeLongB64(v: number): string {
  if (v === 0) return 'A'
  let r = ''
  let n = Math.abs(v)
  while (n > 0) { r = B64[n % 64] + r; n = Math.floor(n / 64) }
  return v < 0 ? '!' + r : r
}

function buildWfsGetFeatureRequest(kmgMid: string): string {
  const longVal = encodeLongB64(parseInt(kmgMid, 10))
  return [
    '7|0|41',
    'https://rkg.gov.si/GERK/WebViewer/gerk_viewer/',
    '1EC629073D5DB5D1EA99AECD4FCD88A3',
    'com.sinergise.common.gis.ogc.wfs.WFSService',
    'getFeature',
    'com.sinergise.common.gis.ogc.wfs.request.WFSGetFeatureRequest/950524315',
    '[Lcom.sinergise.common.gis.filter.FilterDescriptor;/1206055961',
    'com.sinergise.common.gis.filter.ComparisonOperation/2460168433',
    'com.sinergise.common.gis.filter.PropertyName/668160754',
    'KMG_MID',
    'com.sinergise.common.gis.filter.Literal/1711290897',
    'com.sinergise.common.util.property.LongProperty/1311190425',
    'java.lang.Long/4227064769',
    '[Ljava.util.HashSet;/1212085963',
    'java.util.HashSet/3273092938',
    'com.sinergise.common.gis.ogc.OGCRequestContext/2457951422',
    'com.sinergise.common.util.state.gwt.StateGWT/1610259815',
    'java.util.LinkedHashMap/3008245022',
    'java.lang.String/2004016611',
    '__null_state_',
    'true',
    'java.util.HashMap/1797211028',
    'com.sinergise.common.util.web.HttpMethod/96969396',
    'REQUEST',
    'GetFeature',
    'SERVICE',
    'WFS',
    'VERSION',
    '1.1',
    'EXCEPTIONS',
    'INIMAGE',
    'LOCALE',
    'sl',
    'FEATURE_COUNT',
    '1000',
    'TYPENAME',
    'GERK_SDO',
    'PROPERTYNAME',
    '',
    'SORTBY',
    'MAXQUERYFEATURES',
    '-2147483648',
  ].join('|') + '|1|2|3|4|1|5|5|6|1|7|8|9|0|524288|10|11|12|' + longVal +
    '|0|0|1|13|1|14|0|15|16|17|0|0|17|0|1|18|19|18|20|0|21|0|22|1|16|17|0|0|17|0|10|18|23|18|24|18|25|18|26|18|27|18|28|18|29|18|30|18|31|18|32|18|33|18|34|18|35|18|36|18|37|18|38|18|39|-36|18|40|18|41|0|'
}

// Iz GWT-RPC odgovora izvleči string tabelo
// Odgovor vsebuje Infinity, single-quoted stringe in \xHH escape → ni veljavni JSON
function parseGwtResponse(raw: string): { stringTable: string[] } {
  if (!raw.startsWith('//OK')) {
    throw new Error('GWT-RPC napaka: ' + raw.slice(0, 300))
  }

  // Izvleci string tabelo — poišči zadnji ["..."] pred ,0,7]
  // Brackets znotraj stringov ignoriramo z iskanjem ',["' vzorca
  const endMarker = '],0,7]'
  const endPos = raw.lastIndexOf(endMarker)
  if (endPos < 0) throw new Error('Konec GWT-RPC odgovora ni najden.')

  // Poišči začetek string tabele: zadnji ',["' pred endPos
  const stStartMarker = ',["'
  const stStart = raw.lastIndexOf(stStartMarker, endPos)
  if (stStart < 0) throw new Error('String tabela ni najdena v GWT-RPC odgovoru.')

  // Pretvori JS \xHH escape v Unicode \u00HH za JSON.parse
  const stJson = raw.slice(stStart + 1, endPos + 1).replace(/\\x([0-9A-Fa-f]{2})/g, '\\u00$1')
  const stringTable = JSON.parse(stJson) as string[]

  return { stringTable }
}

interface GerkParcelaResult {
  gerk_pid: string
  domace_ime: string
  raba_koda: string
  raba_opis: string
  povrsina_m2: number
}

// Iz string tabele GWT-RPC WFS odgovora poišči parcele.
// Vsak feature ima v string tabeli blok: "@ext:gerk;: PID", DOMACE_IME, ...
// Stolpci (GERK_PID, DOMACE_IME, RABA_ID_OZN_OPIS, …) so v tabeli pred vrednostmi.
function parseGerkParcels(st: string[]): GerkParcelaResult[] {
  const featureIdRe = /^@ext:gerk;:\s*(\d+)$/
  const rabaRe = /^(\d{4})\(([^)]*)\)\s+(.+)$/
  const pidRe = /^\d{5,10}$/
  const coordRe = /^\d+\.\d+,\d+\.\d+$/
  const distRe = /^[\d.]+\s*m$/
  const bboxRe = /^\d{5,6}\.\d+$/
  const skipRe = /Sprememba|kontrole|dolžnosti|Letna|Nov GERK/

  const parcels: GerkParcelaResult[] = []
  // Privzeta RABA je pred prvim @ext znakom
  let currentRaba = ''
  const rabaBeforeFirst = st.find((s) => rabaRe.test(s))
  if (rabaBeforeFirst) currentRaba = rabaBeforeFirst

  for (let i = 0; i < st.length; i++) {
    const fm = st[i].match(featureIdRe)
    if (!fm) continue

    // Zberi stringe do naslednjega @ext ali konca
    const block: string[] = []
    for (let j = i + 1; j < st.length; j++) {
      if (featureIdRe.test(st[j])) break
      const s = st[j]
      if (!s.includes('/')) block.push(s)
    }

    // RABA se pojavi samo ko se spremeni
    if (block.length > 0 && rabaRe.test(block[0])) {
      currentRaba = block.shift()!
    }

    let gerkPid = ''
    let domaceIme = ''

    for (const s of block) {
      if (pidRe.test(s) && !gerkPid) { gerkPid = s; continue }
      if (coordRe.test(s) || distRe.test(s) || bboxRe.test(s)) continue
      if (/^\d+°$/.test(s) || /^\d+%/.test(s)) continue
      if (!domaceIme && s.length > 2 && !skipRe.test(s) && !/^\d/.test(s) && !/^(Title|all_|Fetch|Feature|Max|value|null|show|url|tooltip|format|importance|ignore|type|order|index|Property|TRUE|FALSE)/.test(s)) {
        domaceIme = s
      }
    }

    if (!gerkPid) gerkPid = fm[1]
    const rm = currentRaba.match(rabaRe)

    parcels.push({
      gerk_pid: gerkPid,
      domace_ime: domaceIme,
      raba_koda: rm ? rm[1] : '',
      raba_opis: rm ? rm[3] : currentRaba,
      povrsina_m2: 0, // M2 je v payload tokenih, ne v string tabeli
    })
  }

  // Dopolni površino iz lokalne baze
  return parcels
}

// GET /api/gerk/po-kmg-mid?kmg_mid=100315960
app.get('/api/gerk/po-kmg-mid', async (req, res) => {
  try {
    const kmg_mid = req.query.kmg_mid as string | undefined
    if (!kmg_mid) {
      res.status(400).json({ error: 'Manjka parameter kmg_mid.' })
      return
    }

    const gwtBody = buildWfsGetFeatureRequest(kmg_mid)
    const gwtResp = await fetch(GERK_WFS_URL, {
      method: 'POST',
      headers: GWT_HEADERS,
      body: gwtBody,
    })

    const raw = await gwtResp.text()

    if (req.query.raw === '1') {
      const parsed = parseGwtResponse(raw)
      res.json({
        raw_prefix: raw.slice(0, 2000),
        string_table: parsed.stringTable,
        st_count: parsed.stringTable.length,
      })
      return
    }

    const { stringTable } = parseGwtResponse(raw)
    const parcele = parseGerkParcels(stringTable)

    // Dopolni površino iz lokalne baze gerk_slovenija
    if (parcele.length > 0) {
      const pids = parcele.map((p) => parseInt(p.gerk_pid, 10)).filter(Boolean)
      if (pids.length > 0) {
        type AreaRow = { gerk_pid: string; area_m2: number }
        const areaRows = await prisma.$queryRaw<AreaRow[]>`
          SELECT gerk_pid::text, area_m2::float
          FROM gerk_slovenija
          WHERE gerk_pid = ANY(${pids}::bigint[])
        `
        const areaMap = new Map(areaRows.map((r) => [r.gerk_pid, r.area_m2]))
        for (const p of parcele) {
          p.povrsina_m2 = areaMap.get(p.gerk_pid) ?? 0
        }
      }
    }

    res.json(parcele)
  } catch (e) {
    console.error('Napaka GERK po KMG_MID:', e)
    res.status(500).json({ error: 'Napaka pri poizvedbi GERK po KMG_MID.', details: (e as Error).message })
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
