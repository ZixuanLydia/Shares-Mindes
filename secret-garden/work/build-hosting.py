"""Build the allowlisted Firebase Hosting package without publishing source data."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tempfile


ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = ROOT / "outputs"
HOSTING = ROOT / "hosting"
PUBLIC = HOSTING / "public"
MANIFEST = HOSTING / "build-manifest.json"

BODY_FILES = (
    "LICENSE.txt",
    "NOTICE.txt",
    "hand-model-data.js",
    "vision-wasm-data.js",
    "vision.js",
)
SEMANTIC_FILES = (
    "MODEL-CARD.md",
    "MODEL-LICENSE.txt",
    "NOTICE.txt",
    "ONNX-RUNTIME-LICENSE.txt",
    "TRANSFORMERS-LICENSE.txt",
    "manifest.json",
    "transformers-runtime.js",
)
TYPE_FILES = (
    "DM-Sans-OFL.txt",
    "Instrument-Serif-OFL.txt",
    "NOTICE.txt",
)


def source_file(relative: str) -> Path:
    """Accept regular files inside outputs only, never linked/private paths."""
    path = OUTPUTS / relative
    if not path.is_file() or path.is_symlink():
        raise ValueError(f"Expected a regular publishing asset: {relative}")
    if not path.resolve().is_relative_to(OUTPUTS.resolve()):
        raise ValueError(f"Publishing asset escapes outputs: {relative}")
    parent = path.parent
    while parent != ROOT:
        if parent.is_symlink():
            raise ValueError(f"Linked publishing directory is not allowed: {relative}")
        parent = parent.parent
    return path


def publishing_files() -> dict[str, Path]:
    files = {"index.html": source_file("Secret Garden.html")}
    for directory, names in (
        ("body-assets", BODY_FILES),
        ("semantic-assets", SEMANTIC_FILES),
        ("type-assets", TYPE_FILES),
    ):
        for name in names:
            relative = f"{directory}/{name}"
            files[relative] = source_file(relative)

    model_manifest = json.loads(files["semantic-assets/manifest.json"].read_text())
    for resource in model_manifest["resources"]:
        for name in resource["parts"]:
            # The current model uses flat JavaScript chunks. Never let a future
            # manifest introduce arbitrary files or a path outside its folder.
            part = PurePosixPath(name)
            if (
                len(part.parts) != 1
                or part.name != name
                or not name.startswith("resource-")
                or not name.endswith(".js")
                or not all(character.isdigit() or character == "-" for character in name[9:-3])
                or not name[9:-3]
            ):
                raise ValueError(f"Unexpected semantic asset path: {name!r}")
            relative = f"semantic-assets/{name}"
            files[relative] = source_file(relative)
    return dict(sorted(files.items()))


def describe_file(relative: str, path: Path) -> dict[str, str | int]:
    data = path.read_bytes()
    return {
        "path": relative,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def build() -> None:
    files = publishing_files()
    HOSTING.mkdir(exist_ok=True)
    if PUBLIC.is_symlink() or (PUBLIC.exists() and not PUBLIC.is_dir()):
        raise ValueError("hosting/public must be a generated directory, never a link or file")
    if MANIFEST.is_symlink():
        raise ValueError("hosting/build-manifest.json must not be a link")

    with tempfile.TemporaryDirectory(prefix=".public-build-", dir=HOSTING) as temporary:
        staged = Path(temporary) / "public"
        staged.mkdir()
        descriptions = []
        for relative, source in files.items():
            destination = staged / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            description = describe_file(relative, destination)
            if description != describe_file(relative, source):
                raise ValueError(f"Publishing copy did not verify: {relative}")
            descriptions.append(description)

        staged_files = {path.relative_to(staged).as_posix() for path in staged.rglob("*") if path.is_file()}
        if staged_files != set(files):
            raise ValueError("The publishing directory differs from the public allowlist")

        manifest = {
            "schema_version": 1,
            "public_directory": "hosting/public",
            "source_document": "outputs/Secret Garden.html",
            "file_count": len(descriptions),
            "total_bytes": sum(item["bytes"] for item in descriptions),
            "files": descriptions,
        }
        manifest_text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
        if PUBLIC.exists():
            shutil.rmtree(PUBLIC)
        staged.replace(PUBLIC)
        MANIFEST.write_text(manifest_text, encoding="utf-8")

    print(f"Prepared {manifest['file_count']} public files ({manifest['total_bytes']:,} bytes).")
    print("Verified public files against hosting/build-manifest.json.")


if __name__ == "__main__":
    build()
