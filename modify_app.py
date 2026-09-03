import re

with open('/Users/yongkroo/Documents/SPARC/central_daily_dashboard/src/App.tsx', 'r') as f:
    content = f.read()

# Add import
content = content.replace("import { SalesVelocityDashboard, GOLSalesVelocityDashboard } from './pages/SalesVelocityDashboard'",
"import { SalesVelocityDashboard, GOLSalesVelocityDashboard } from './pages/SalesVelocityDashboard'\nimport { CCSalesDashboard, GOLCCSalesDashboard } from './pages/CCSalesDashboard'")

# Add GOL route
content = content.replace('<Route path="/gol-sales-velocity" element={<GOLSalesVelocityDashboard />} />',
'<Route path="/gol-sales-velocity" element={<GOLSalesVelocityDashboard />} />\n              <Route path="/gol-cc-sales" element={<GOLCCSalesDashboard />} />')

# Add MNC route
content = content.replace('<Route path="/sales-velocity" element={<SalesVelocityDashboard />} />',
'<Route path="/sales-velocity" element={<SalesVelocityDashboard />} />\n              <Route path="/cc-sales" element={<CCSalesDashboard />} />')

with open('/Users/yongkroo/Documents/SPARC/central_daily_dashboard/src/App.tsx', 'w') as f:
    f.write(content)
