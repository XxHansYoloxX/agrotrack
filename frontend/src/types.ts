export interface GeoJsonPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface Parcela {
  id: string
  naziv: string
  gmid: string | null
  povrsina: number
  kultura: string | null
  meja: GeoJsonPolygon | null
}

export interface GerkParcela {
  gerk_pid: string
  raba_id: number | null
  area_m2: number
  opis_rabe: string | null
  geometry: GeoJsonPolygon
}

export interface KmgParcela {
  gerk_pid: string
  domace_ime: string
  raba_koda: string
  raba_opis: string
  povrsina_m2: number
}

export type VrstaPosevka =
  | 'glavni_ozimni' | 'glavni_jarni'
  | 'naknadni_prezimni' | 'naknadni_neprezimni'
  | 'medsevek' | 'pokrovna_kultura' | 'trajnica' | 'zelenjadnica'

export const VRSTA_POSEVKA_LABELS: Record<VrstaPosevka, string> = {
  glavni_ozimni: 'Glavni ozimni',
  glavni_jarni: 'Glavni jarni',
  naknadni_prezimni: 'Naknadni prezimni',
  naknadni_neprezimni: 'Naknadni neprezimni',
  medsevek: 'Medsevek',
  pokrovna_kultura: 'Pokrovna kultura',
  trajnica: 'Trajnica',
  zelenjadnica: 'Zelenjadnica',
}

export interface KolobarPosevek {
  id: string
  parcelaId: string
  leto: number
  vrstaPosevka: VrstaPosevka
  kultura: string
  datumSetve: string | null
  datumSpravila: string | null
  pridelekTha: number | null
  opomba: string | null
}

export interface Kmetija {
  id: string
  ime: string
  naslov: string | null
}
