/**
 * Domain-based configuration
 * Routes and PIN are determined by the hostname.
 */

const host = window.location.hostname

export const IS_GOL_CC = host.includes('gol-cc.')
export const IS_MNC_CC = host.includes('mnc-cc.')
export const IS_GOLO = !IS_GOL_CC && host.includes('golo.')
export const IS_MNC = !IS_MNC_CC && host.includes('mnc.')
export const IS_MCI = host.includes('mci.')

export const IS_MAIN_DOMAIN = !IS_GOL_CC && !IS_MNC_CC && !IS_GOLO && !IS_MNC && !IS_MCI

export const DOMAIN_PIN = IS_GOL_CC ? '765765' : IS_MNC_CC ? '335544' : IS_GOLO ? '168168' : IS_MNC ? '908908' : IS_MCI ? '122334' : '232345'
export const DOMAIN_BRAND = IS_GOL_CC ? 'GOLO' : IS_MNC_CC ? 'MNC' : IS_GOLO ? 'GOLO' : IS_MNC ? 'MNC' : IS_MCI ? 'MCI' : 'ALL'
/** Brand code for report filtering (GOL not GOLO) */
export const REPORT_BRAND = IS_GOL_CC ? 'GOL' : IS_GOLO ? 'GOL' : IS_MNC_CC ? 'MNC' : IS_MNC ? 'MNC' : IS_MCI ? 'MCI' : null

/** Sidebar routes visible on the current domain */
export const ALLOWED_ROUTES: string[] = IS_GOL_CC
  ? ['/gol-cc-sales']
  : IS_MNC_CC
  ? ['/cc-sales']
  : IS_GOLO
  ? ['/gol', '/gol-sales-velocity', '/gol-cc-sales', '/gol-campaigns', '/platform-overview', '/dp-leads', '/csv-downloader', '/insight-report']
  : IS_MNC
  ? ['/mnc', '/platform-overview', '/sales-velocity', '/cc-sales', '/campaign-explorer', '/dp-leads', '/csv-downloader', '/insight-report']
  : IS_MCI
  ? ['/mci', '/mci-campaigns', '/platform-overview', '/csv-downloader', '/insight-report']
  : ['/overview', '/mnc', '/gol', '/mci', '/platform-overview', '/sales-velocity', '/cc-sales', '/gol-sales-velocity', '/gol-cc-sales', '/campaign-explorer', '/gol-campaigns', '/mci-campaigns', '/dp-leads', '/pipeline-status', '/csv-downloader', '/insight-report', '/ab-test']

/** Default landing page */
export const DEFAULT_ROUTE = IS_GOL_CC ? '/gol-cc-sales' : IS_MNC_CC ? '/cc-sales' : IS_GOLO ? '/gol' : IS_MNC ? '/mnc' : IS_MCI ? '/mci' : '/overview'
