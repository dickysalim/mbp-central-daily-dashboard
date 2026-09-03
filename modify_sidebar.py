import re

with open('/Users/yongkroo/Documents/SPARC/central_daily_dashboard/src/components/layout/Sidebar.tsx', 'r') as f:
    content = f.read()

mnc_cc_sales = """  {
    to: '/cc-sales',
    label: 'MNC CC Sales',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
"""

gol_cc_sales = """  {
    to: '/gol-cc-sales',
    label: 'GOL CC Sales',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
"""

# Insert after MNC Sales Velocity
content = content.replace("label: 'MNC Sales Velocity',\n    icon: (\n      <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2\" strokeLinecap=\"round\" strokeLinejoin=\"round\">\n        <path d=\"M13 2L3 14h9l-1 8 10-12h-9l1-8z\" />\n      </svg>\n    ),\n  },\n", 
"label: 'MNC Sales Velocity',\n    icon: (\n      <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2\" strokeLinecap=\"round\" strokeLinejoin=\"round\">\n        <path d=\"M13 2L3 14h9l-1 8 10-12h-9l1-8z\" />\n      </svg>\n    ),\n  },\n" + mnc_cc_sales)

# Insert after GOL Sales Velocity
content = content.replace("label: 'GOL Sales Velocity',\n    icon: (\n      <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2\" strokeLinecap=\"round\" strokeLinejoin=\"round\">\n        <path d=\"M13 2L3 14h9l-1 8 10-12h-9l1-8z\" />\n      </svg>\n    ),\n  },\n", 
"label: 'GOL Sales Velocity',\n    icon: (\n      <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2\" strokeLinecap=\"round\" strokeLinejoin=\"round\">\n        <path d=\"M13 2L3 14h9l-1 8 10-12h-9l1-8z\" />\n      </svg>\n    ),\n  },\n" + gol_cc_sales)

with open('/Users/yongkroo/Documents/SPARC/central_daily_dashboard/src/components/layout/Sidebar.tsx', 'w') as f:
    f.write(content)
