export interface ChangelogRow {
  date:       string        // YYYY-MM-DD — used to plot chart markers
  brand:      string        // e.g. "MNC", "GLOBAL"
  sku:        string        // e.g. "MSF", "" for brand-level
  platform:   string        // e.g. "META", "GOOGLE", ""
  title:      string        // headline
  changelist: string | null // body content
}
