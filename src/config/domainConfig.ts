/**
 * Domain-based configuration
 * Routes and PIN are determined by the hostname.
 */

const host = window.location.hostname

export const IS_GOLO = host.includes('golo.')

export const DOMAIN_PIN = IS_GOLO ? '168168' : '232345'
export const DOMAIN_BRAND = IS_GOLO ? 'GOLO' : 'ALL'

/** Sidebar routes visible on the current domain */
export const ALLOWED_ROUTES: string[] = IS_GOLO
  ? ['/gol', '/gol-sales-velocity', '/platform-overview']
  : ['/overview', '/mnc', '/gol', '/mci', '/platform-overview', '/sales-velocity', '/gol-sales-velocity', '/pipeline-status']

/** Default landing page */
export const DEFAULT_ROUTE = IS_GOLO ? '/gol' : '/overview'
