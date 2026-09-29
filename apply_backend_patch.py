from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
training = root / "backend" / "training" if (root / "backend" / "training").exists() else root / "training"
models = training / "models.py"
urls = training / "urls.py"

if not models.exists() or not urls.exists():
    raise SystemExit("Could not find backend/training or training. Pass the project root as argument.")

models_text = models.read_text(encoding="utf-8")
hook = "from .import_center.models import TrainingImportJob, TrainingImportBinding  # noqa: E402,F401"
if hook not in models_text:
    models.write_text(models_text.rstrip() + "\n\n" + hook + "\n", encoding="utf-8")
    print("Patched training/models.py")
else:
    print("training/models.py already patched")

urls_text = urls.read_text(encoding="utf-8")
route = 'path("import-center/", include("training.import_center.urls")),'
if route not in urls_text:
    marker = "urlpatterns = ["
    if marker not in urls_text:
        raise SystemExit("Could not locate urlpatterns in training/urls.py")
    urls_text = urls_text.replace(marker, marker + "\n    " + route, 1)
    urls.write_text(urls_text, encoding="utf-8")
    print("Patched training/urls.py")
else:
    print("training/urls.py already patched")
