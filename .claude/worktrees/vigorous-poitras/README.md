# AgroTrack — Sprint 1

Kmetijska aplikacija za upravljanje parcel, delavcev, strojev in dela.

## Arhitektura

```
agrotrack/
├── docker-compose.yml        # PostgreSQL 16 + PostGIS + TimescaleDB, Redis, MinIO
├── backend/                  # Node.js + Express + TypeScript + Prisma
│   ├── prisma/
│   │   ├── schema.prisma     # 15 tabel z UUID PK in tujimi ključi
│   │   └── seed.ts           # 1 kmetija, 3 parcele, 2 delavca
│   └── src/
│       └── index.ts          # Express strežnik, port 3000
└── frontend/                 # React + Vite + TypeScript + Leaflet
    └── src/
        ├── App.tsx
        ├── components/
        │   ├── ParcelaMap.tsx # Leaflet karta s parcelami
        │   └── Sidebar.tsx
        └── hooks/
            └── useParcele.ts
```

## Predpogoji

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 20+](https://nodejs.org/)
- npm 10+

## Zagon (prvi zagon)

### 1. Zaženi infrastrukturo

```bash
docker-compose up -d
```

Počakaj ~15 sekund da se PostgreSQL inicializira (TimescaleDB potrebuje čas).

### 2. Nastavi backend

```bash
cd backend
cp .env.example .env
npm install
npm run db:generate    # generira Prisma client
npm run db:push        # ustvari tabele v bazi
npm run db:seed        # vstavi testne podatke
npm run dev            # zažene strežnik na http://localhost:3000
```

### 3. Zaženi frontend (nov terminal)

```bash
cd frontend
npm install
npm run dev            # zažene na http://localhost:5173
```

Odpri [http://localhost:5173](http://localhost:5173).

## API endpointi

| Metoda | Pot | Opis |
|--------|-----|------|
| GET | `/health` | Stanje strežnika in povezave z DB |
| GET | `/api/kmetije` | Seznam kmetij |
| GET | `/api/parcele` | Parcele z GeoJSON mejo |
| GET | `/api/delavci` | Aktivni delavci |

## Podatkovne baze (docker-compose)

| Storitev | Port | Kredeniale |
|----------|------|------------|
| PostgreSQL | 5432 | `agrotrack` / `agrotrack_secret` |
| Redis | 6379 | brez gesla |
| MinIO | 9000 / 9001 | `agrotrack_minio` / `agrotrack_minio_secret` |

MinIO konzola: [http://localhost:9001](http://localhost:9001)

## Prisma tabele (Sprint 1)

| Tabela | Opis |
|--------|------|
| `kmetija` | Kmetijsko gospodarstvo |
| `uporabnik` | Uporabniki sistema |
| `parcela` | Parcele s PostGIS polygon mejo |
| `stroj` | Traktorji in druga mehanizacija |
| `prikljucek` | Priključki za stroje |
| `delavec` | Delavci s RFID oznako |
| `kolobar` | Kolobar po letu in parceli |
| `kolobar_posevek` | Posevki znotraj kolobarja |
| `analiza_tal` | Rezultati analize tal |
| `gnojilni_nacrt` | Gnojilni načrti |
| `delovni_nalog` | Delovni nalogi |
| `izvedba_dela` | Evidenca izvedbe dela |
| `strosek` | Stroški dela |
| `repromaterial` | Zaloge repromateriala |
| `rfid_dogodek` | RFID prijave/odjave delavcev |

## Ponoven zagon

```bash
docker-compose up -d   # infrastruktura
cd backend && npm run dev
cd frontend && npm run dev
```

## Ponastavitev baze

```bash
docker-compose down -v   # izbriše vse volume podatke
docker-compose up -d
cd backend && npm run db:push && npm run db:seed
```
