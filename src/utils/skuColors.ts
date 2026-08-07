/**
 * SKU color map — single source of truth.
 */
export const SKU_COLORS: Record<string, string> = {
  MTA: '#fdba74',  // light orange
  MSF: '#f97316',  // orange
  M3P: '#34d399',  // green
  MNS: '#60a5fa',  // blue
}

/** Get color for a SKU, with fallback */
export const skuColor = (sku: string): string =>
  SKU_COLORS[sku.toUpperCase()] ?? 'rgba(255,255,255,0.68)'
