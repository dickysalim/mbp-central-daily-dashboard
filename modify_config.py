import re

with open('/Users/yongkroo/Documents/SPARC/central_daily_dashboard/src/config/domainConfig.ts', 'r') as f:
    content = f.read()

content = content.replace("'/gol', '/gol-sales-velocity', '/gol-campaigns',", "'/gol', '/gol-sales-velocity', '/gol-cc-sales', '/gol-campaigns',")
content = content.replace("'/mnc', '/platform-overview', '/sales-velocity',", "'/mnc', '/platform-overview', '/sales-velocity', '/cc-sales',")
content = content.replace("'/platform-overview', '/sales-velocity', '/gol-sales-velocity',", "'/platform-overview', '/sales-velocity', '/cc-sales', '/gol-sales-velocity', '/gol-cc-sales',")

with open('/Users/yongkroo/Documents/SPARC/central_daily_dashboard/src/config/domainConfig.ts', 'w') as f:
    f.write(content)
