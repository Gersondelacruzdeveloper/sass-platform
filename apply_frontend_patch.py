from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
front = root / "frontend" if (root / "frontend").exists() else root
routes = front / "src/modules/training/routes/trainingRoutes.tsx"
sidebar = front / "src/modules/training/components/TrainingSidebar.tsx"

if not routes.exists() or not sidebar.exists():
    raise SystemExit("Could not find Training routes/sidebar. Pass the project root or frontend root.")

text = routes.read_text(encoding="utf-8")
imp = 'import ImportCenterPage from "../import-center/ImportCenterPage";'
if imp not in text:
    anchor = 'import FacilitatorTrainingQueuePage from "../pages/FacilitatorTrainingQueuePage";'
    if anchor not in text: raise SystemExit("Route import anchor not found")
    text = text.replace(anchor, anchor + "\n" + imp)
route = '<Route path="import-center" element={<ImportCenterPage />} />'
if route not in text:
    anchor = '<Route path="standards" element={<StandardsPage />} />'
    if anchor not in text: raise SystemExit("Route insertion anchor not found")
    text = text.replace(anchor, anchor + "\n        " + route)
routes.write_text(text, encoding="utf-8")
print("Patched trainingRoutes.tsx")

text = sidebar.read_text(encoding="utf-8")
needle = "      {\n        label: \"Estándares\",\n        path: `${rutaBase}/standards`,\n        icon: \"🏆\",\n        adminOnly: true,\n      },"
addition = needle + "\n      {\n        label: \"Importar configuración\",\n        path: `${rutaBase}/import-center`,\n        icon: \"📥\",\n        adminOnly: true,\n      },"
if 'path: `${rutaBase}/import-center`' not in text:
    if needle not in text: raise SystemExit("Sidebar insertion anchor not found")
    text = text.replace(needle, addition)
sidebar.write_text(text, encoding="utf-8")
print("Patched TrainingSidebar.tsx")
