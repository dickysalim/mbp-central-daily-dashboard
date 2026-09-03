import re

with open('/Users/yongkroo/Documents/SPARC/central_daily_dashboard/src/pages/CCSalesDashboard.tsx', 'r') as f:
    content = f.read()

# Fix golLogo import
content = re.sub(r"import golLogo from '\.\./assets/brand_logos/GOL\.webp'\n", "", content)
content = content.replace("import mncLogo from '../assets/brand_logos/MNC.webp'", "import mncLogo from '../assets/brand_logos/MNC.webp'\nimport golLogo from '../assets/brand_logos/GOL.webp'")

# Change main component name and props
content = content.replace("export function SalesVelocityDashboard", "export function CCSalesDashboard")
content = content.replace("interface SalesVelocityProps", "interface CCSalesProps")
content = content.replace("}: SalesVelocityProps = {})", "}: CCSalesProps = {})")
content = content.replace("brandLabel = 'MNC Sales Velocity'", "brandLabel = 'MNC CC Sales'")

# Change GOL component name and props
content = content.replace("export function GOLSalesVelocityDashboard", "export function GOLCCSalesDashboard")
content = content.replace("<SalesVelocityDashboard", "<CCSalesDashboard")
content = content.replace('brandLabel="GOL Sales Velocity"', 'brandLabel="GOL CC Sales"')

# Remove Target Summary Card block and Row 2 block
# Target Summary Card starts at {/* ── Target Summary Card ── */} and ends before {/* ── Row 1:
content = re.sub(r'\{\/\* ── Target Summary Card ── \*\/\}.*?\{\/\* ── Row 1:', '{/* ── Row 1:', content, flags=re.DOTALL)

# Row 2 starts at {/* ── Row 2: and ends before </div>\n  )\n}
content = re.sub(r'\{\/\* ── Row 2:.*?</div>\n\n    </div>', '</div>\n\n    </div>', content, flags=re.DOTALL)

with open('/Users/yongkroo/Documents/SPARC/central_daily_dashboard/src/pages/CCSalesDashboard.tsx', 'w') as f:
    f.write(content)
