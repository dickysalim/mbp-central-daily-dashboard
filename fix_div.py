with open('/Users/yongkroo/Documents/SPARC/central_daily_dashboard/src/pages/CCSalesDashboard.tsx', 'r') as f:
    content = f.read()

content = content.replace("      </div>\n\n      </div>\n\n    </div>", "      </div>\n\n    </div>")

with open('/Users/yongkroo/Documents/SPARC/central_daily_dashboard/src/pages/CCSalesDashboard.tsx', 'w') as f:
    f.write(content)
