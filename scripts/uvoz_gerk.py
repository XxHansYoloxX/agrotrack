#!/usr/bin/env python3
"""
Uvoz GERK parcel iz shapefileа v PostgreSQL tabelo `gerk_slovenija`.

Tabela se ustvari samodejno. Obstoječi zapisi se preskočijo (ON CONFLICT DO NOTHING).
Podprti koordinatni sistemi: EPSG:3794 (D96/TM) in EPSG:3912 (MGI/Slovene National Grid).

Uporaba:
    python3 scripts/uvoz_gerk.py
    python3 scripts/uvoz_gerk.py --shp data/gerk/GERK_RKG_30jun_2025.shp
    python3 scripts/uvoz_gerk.py --limit 10000   # test z delnim naborom
    python3 scripts/uvoz_gerk.py --batch 2000    # večja serija za hitrejši uvoz
"""

import argparse
import os
import sys
import time

import geopandas as gpd
import psycopg2
import psycopg2.extras

# Privzeta pot do shapefileа
DEFAULT_SHP = os.path.join(
    os.path.dirname(__file__), "..", "data", "gerk", "GERK_RKG_30jun_2025.shp"
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://agrotrack:agrotrack_secret@localhost:5432/agrotrack",
)

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS gerk_slovenija (
    gerk_pid   BIGINT PRIMARY KEY,
    raba_id    INTEGER,
    area_m2    DECIMAL(14, 2),
    opis_rabe  TEXT,
    geometrija geometry(Polygon, 4326)
);
"""

CREATE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS gerk_slovenija_geom_idx
    ON gerk_slovenija USING GIST (geometrija);
"""

# Podprti izvorni CRS → auto-reprojektiramo v WGS84
SUPPORTED_CRS = {
    3794: "D96/TM (Slovenija 1996)",
    3912: "MGI/Slovene National Grid",
    4326: "WGS84 (brez reprojektiranja)",
}

PROGRESS_STEP = 50_000


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Uvoz GERK shapefileа v PostgreSQL")
    p.add_argument("--shp", default=DEFAULT_SHP, help="Pot do .shp datoteke")
    p.add_argument("--limit", type=int, default=None, help="Uvozi samo prvih N parcel (test)")
    p.add_argument("--batch", type=int, default=1000, help="Velikost serije (privzeto 1000)")
    return p.parse_args()


def detect_crs(gdf: gpd.GeoDataFrame) -> int:
    epsg = gdf.crs.to_epsg() if gdf.crs else None
    if epsg is None:
        print("  OPOZORILO: CRS ni zaznan — predpostavljam EPSG:3794")
        return 3794
    if epsg not in SUPPORTED_CRS:
        print(f"  OPOZORILO: Neznan CRS EPSG:{epsg} — poskušam z reprojektiranjem v 4326")
    return epsg


def normalize_polygon(geom):
    """MultiPolygon → Polygon (vzamemo del z največjo površino)."""
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type == "MultiPolygon":
        return max(geom.geoms, key=lambda g: g.area)
    if geom.geom_type == "Polygon":
        return geom
    return None


def main() -> None:
    args = parse_args()
    shp_path = os.path.normpath(args.shp)

    if not os.path.exists(shp_path):
        print(f"NAPAKA: Shapefile ne obstaja: {shp_path}", file=sys.stderr)
        sys.exit(1)

    # ── 1. Branje shapefileа ─────────────────────────────────────────────────
    print(f"Berem shapefile: {shp_path}")
    t_start = time.time()
    gdf = gpd.read_file(shp_path, rows=args.limit)
    print(f"  Prebrano {len(gdf):,} vrstic  ({time.time()-t_start:.1f}s)")

    # ── 2. Reprojektiranje ───────────────────────────────────────────────────
    epsg = detect_crs(gdf)
    crs_name = SUPPORTED_CRS.get(epsg, f"EPSG:{epsg}")
    if epsg != 4326:
        print(f"Reprojekcija {crs_name} → EPSG:4326 ...")
        t1 = time.time()
        gdf = gdf.to_crs(epsg=4326)
        print(f"  Končana v {time.time()-t1:.1f}s")
    else:
        print(f"CRS: {crs_name} — reprojektiranje ni potrebno.")

    # ── 3. Vzpostavitev baze ─────────────────────────────────────────────────
    print(f"Vzpostavljam povezavo: {DATABASE_URL[:45]}...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("Ustvarjam tabelo gerk_slovenija (če ne obstaja)...")
    cur.execute(CREATE_TABLE_SQL)
    cur.execute(CREATE_INDEX_SQL)
    conn.commit()

    # ── 4. Uvoz v serijah ────────────────────────────────────────────────────
    total = len(gdf)
    batch_size = args.batch
    inserted = skipped = errors = 0
    t_uvoz = time.time()

    print(f"Uvažam {total:,} parcel (serije po {batch_size}) ...")
    print(f"  Napredek vsakih {PROGRESS_STEP:,} zapisov\n")

    for batch_start in range(0, total, batch_size):
        chunk = gdf.iloc[batch_start : batch_start + batch_size]
        rows = []

        for _, row in chunk.iterrows():
            geom = normalize_polygon(row.geometry)
            if geom is None:
                errors += 1
                continue

            try:
                gerk_pid = int(row["GERK_PID"])
                raba_id  = int(row["RABA_ID"]) if row.get("RABA_ID") is not None else None
                area_m2  = float(row["AREA"]) if row.get("AREA") is not None else 0.0
                opis     = str(row["OPIS_RABE"]) if row.get("OPIS_RABE") else None
            except (ValueError, KeyError) as exc:
                errors += 1
                continue

            rows.append((gerk_pid, raba_id, round(area_m2, 2), opis, geom.wkt))

        if rows:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO gerk_slovenija (gerk_pid, raba_id, area_m2, opis_rabe, geometrija)
                VALUES %s
                ON CONFLICT (gerk_pid) DO NOTHING
                """,
                rows,
                template="(%s, %s, %s, %s, ST_GeomFromText(%s, 4326))",
            )
            conn.commit()
            inserted += len(rows)
            skipped  += batch_size - len(rows) - errors

        done = min(batch_start + batch_size, total)
        if done % PROGRESS_STEP < batch_size or done == total:
            elapsed = time.time() - t_uvoz
            rate = done / elapsed if elapsed > 0 else 0
            eta  = (total - done) / rate if rate > 0 else 0
            print(
                f"  {done:>7,}/{total:,}  ({100*done/total:5.1f}%)  "
                f"{rate:6.0f} rec/s  ETA {eta:.0f}s"
            )

    conn.close()

    elapsed_total = time.time() - t_start
    print(f"\n{'─'*50}")
    print(f"Končano v {elapsed_total:.1f}s")
    print(f"  Uvoženo:    {inserted:,}")
    print(f"  Preskočeno: {skipped:,}  (ON CONFLICT)")
    print(f"  Napake:     {errors:,}")


if __name__ == "__main__":
    main()
