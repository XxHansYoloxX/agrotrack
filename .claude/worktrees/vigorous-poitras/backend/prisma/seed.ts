import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Testna kmetija
  const kmetija = await prisma.kmetija.upsert({
    where: { davcnaSt: 'SI12345678' },
    update: {},
    create: {
      ime: 'Kmetija Novak',
      naslov: 'Vaška cesta 12, 3320 Velenje',
      davcnaSt: 'SI12345678',
      kmetSt: 'KMG-MID-100001',
    },
  })
  console.log(`Kmetija: ${kmetija.ime} (${kmetija.id})`)

  // Testni delavci
  const [ana, janez] = await Promise.all([
    prisma.delavec.upsert({
      where: { emso: '1234567890123' },
      update: {},
      create: {
        kmetijaId: kmetija.id,
        ime: 'Ana',
        priimek: 'Novak',
        emso: '1234567890123',
        rfidTag: 'RFID-ANA-001',
      },
    }),
    prisma.delavec.upsert({
      where: { emso: '9876543210987' },
      update: {},
      create: {
        kmetijaId: kmetija.id,
        ime: 'Janez',
        priimek: 'Kovač',
        emso: '9876543210987',
        rfidTag: 'RFID-JANEZ-002',
      },
    }),
  ])
  console.log(`Delavca: ${ana.ime} ${ana.priimek}, ${janez.ime} ${janez.priimek}`)

  // Testne parcele — koordinate okrog Velenja (WGS84)
  const parceleDef = [
    {
      naziv: 'Njiva Sever',
      gmid: 'GMID-001',
      povrsina: 2.45,
      kultura: 'Koruza',
      // WKT polygon — pravokotnik severno od Velenja
      wkt: 'POLYGON((15.110 46.380, 15.125 46.380, 15.125 46.390, 15.110 46.390, 15.110 46.380))',
    },
    {
      naziv: 'Travnik Vzhod',
      gmid: 'GMID-002',
      povrsina: 1.80,
      kultura: 'Trava',
      wkt: 'POLYGON((15.130 46.375, 15.145 46.375, 15.145 46.385, 15.130 46.385, 15.130 46.375))',
    },
    {
      naziv: 'Vrt Jug',
      gmid: 'GMID-003',
      povrsina: 0.35,
      kultura: 'Zelenjava',
      wkt: 'POLYGON((15.118 46.365, 15.126 46.365, 15.126 46.370, 15.118 46.370, 15.118 46.365))',
    },
  ]

  for (const def of parceleDef) {
    // PostGIS geometry insert requires raw SQL
    const existing = await prisma.parcela.findUnique({ where: { gmid: def.gmid } })
    if (!existing) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO parcela (id, kmetija_id, naziv, gmid, povrsina, kultura, meja, created_at, updated_at)
        VALUES (
          uuid_generate_v4(),
          '${kmetija.id}',
          '${def.naziv}',
          '${def.gmid}',
          ${def.povrsina},
          '${def.kultura}',
          ST_GeomFromText('${def.wkt}', 4326),
          NOW(),
          NOW()
        )
      `)
      console.log(`Parcela: ${def.naziv}`)
    } else {
      console.log(`Parcela že obstaja: ${def.naziv}`)
    }
  }

  console.log('Seeding done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
