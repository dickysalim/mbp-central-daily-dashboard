/**
 * Province → Island mapping for Indonesia
 * Used by DpLeadsPage for Meta Ads-style hierarchy: Island → Province → City → Agent
 */

export const PROVINCE_TO_ISLAND: Record<string, string> = {
  // ── Sumatera ──
  'Aceh': 'Sumatera',
  'Sumatera Utara': 'Sumatera',
  'Sumatera Barat': 'Sumatera',
  'Riau': 'Sumatera',
  'Kepulauan Riau': 'Sumatera',
  'Jambi': 'Sumatera',
  'Sumatera Selatan': 'Sumatera',
  'Kepulauan Bangka Belitung': 'Sumatera',
  'Bengkulu': 'Sumatera',
  'Lampung': 'Sumatera',

  // ── Jawa ──
  'DKI Jakarta': 'Jawa',
  'Banten': 'Jawa',
  'Jawa Barat': 'Jawa',
  'Jawa Tengah': 'Jawa',
  'DI Yogyakarta': 'Jawa',
  'Jawa Timur': 'Jawa',

  // ── Kalimantan ──
  'Kalimantan Barat': 'Kalimantan',
  'Kalimantan Tengah': 'Kalimantan',
  'Kalimantan Selatan': 'Kalimantan',
  'Kalimantan Timur': 'Kalimantan',
  'Kalimantan Utara': 'Kalimantan',

  // ── Sulawesi ──
  'Sulawesi Utara': 'Sulawesi',
  'Gorontalo': 'Sulawesi',
  'Sulawesi Tengah': 'Sulawesi',
  'Sulawesi Barat': 'Sulawesi',
  'Sulawesi Selatan': 'Sulawesi',
  'Sulawesi Tenggara': 'Sulawesi',

  // ── Bali & Nusa Tenggara ──
  'Bali': 'Bali & Nusa Tenggara',
  'Nusa Tenggara Barat': 'Bali & Nusa Tenggara',
  'Nusa Tenggara Timur': 'Bali & Nusa Tenggara',

  // ── Maluku ──
  'Maluku': 'Maluku',
  'Maluku Utara': 'Maluku',

  // ── Papua ──
  'Papua': 'Papua',
  'Papua Barat': 'Papua',
  'Papua Tengah': 'Papua',
  'Papua Pegunungan': 'Papua',
  'Papua Selatan': 'Papua',
  'Papua Barat Daya': 'Papua',
}

/** Get island name for a province, with fallback */
export function getIsland(province: string): string {
  return PROVINCE_TO_ISLAND[province] ?? 'Lainnya'
}

/** All island names in display order (west → east) */
export const ISLAND_ORDER = [
  'Sumatera',
  'Jawa',
  'Kalimantan',
  'Bali & Nusa Tenggara',
  'Sulawesi',
  'Maluku',
  'Papua',
  'Lainnya',
]
