"""Create a local handoff package without user databases, sessions or QA fixtures."""
from pathlib import Path
import json
import re
import zipfile

root = Path(__file__).resolve().parent.parent
build = (root / "work/build-preview.py").read_text()
fragments = re.findall(r'"(__[A-Z_]+__)": "([^"]+)"', build)
files = {
    "README.md", "work/build-preview.py", "work/package-v1.py",
    "work/garden-template.html", "work/garden.jpg",
    "work/v1-audit-report.json",
    "server/shared_garden.py", "server/start.command", "server/test_shared_garden.py",
    "outputs/Secret Garden.html", "outputs/Start Shared Garden.command",
    "outputs/USER_GUIDE.md", "outputs/Secret Garden V1 Audit.md",
}
files.update("work/" + name for _, name in fragments)
qa = json.loads((root / "work/v1-audit-report.json").read_text())
files.update(qa["node_suites"])
files.update(qa["proof"])
for directory in ["body-assets", "semantic-assets", "type-assets"]:
    files.update(str(path.relative_to(root)) for path in (root / "outputs" / directory).rglob("*")
                 if path.is_file() and not any(part.startswith(".") for part in path.relative_to(root).parts))

for name in files:
    if not (root / name).is_file():
        raise FileNotFoundError(name)
    if "/data/" in name or name.endswith((".sqlite3", ".sqlite3-wal", ".sqlite3-shm")):
        raise ValueError("User data must stay outside the handoff package")

archive = root / "outputs/Secret Garden V1.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as package:
    for name in sorted(files):
        package.write(root / name, "Secret Garden V1/" + name)
with zipfile.ZipFile(archive) as package:
    bad = package.testzip()
    if bad:
        raise ValueError("Invalid archive member: " + bad)
print(json.dumps({"archive": str(archive), "files": len(files), "bytes": archive.stat().st_size,
                  "user_database_included": False}, ensure_ascii=False))
