#!/usr/bin/env python3
import os
import datetime
from pathlib import Path
from xml.sax.saxutils import escape

# Optional dependency: install with `pip install pathspec`
try:
    import pathspec
except ImportError:
    pathspec = None
    print("⚠️  pathspec not installed; .gitignore will be ignored. Run: pip install pathspec")

# ---------- CONFIG ----------
REPO_DIR = Path.cwd()  # run from the directory you want to export
OUTPUT_FILE = REPO_DIR / "codebase.xml"
VALID_EXTENSIONS = (
    ".js", ".jsx", ".ts", ".tsx", ".py", ".html", ".css",
    ".json", ".yml", ".yaml", ".sh", ".md"
)
IGNORE_DIRS = {
    "node_modules", "dist", "build", ".git", ".cache", ".vite",
    ".idea", "__pycache__", ".DS_Store"
}
SKIP_FILES = {
    "package-lock.json", "pnpm-lock.yaml", "yarn.lock"
}
# ----------------------------


def detect_lang(ext: str) -> str:
    # lightweight mapping inline; avoids separate dict
    match ext.lower():
        case ".py": return "python"
        case ".js": return "javascript"
        case ".jsx": return "javascriptreact"
        case ".ts": return "typescript"
        case ".tsx": return "typescriptreact"
        case ".html": return "html"
        case ".css": return "css"
        case ".json": return "json"
        case ".yml" | ".yaml": return "yaml"
        case ".sh": return "bash"
        case ".md": return "markdown"
        case _: return "text"


def load_gitignore(repo_dir: Path):
    gitignore_path = repo_dir / ".gitignore"
    if gitignore_path.exists() and pathspec:
        spec = pathspec.PathSpec.from_lines("gitwildmatch", gitignore_path.read_text().splitlines())
        return spec
    return None


def is_ignored(path: Path, repo_dir: Path, spec):
    if not spec:
        return False
    rel = str(path.relative_to(repo_dir))
    return spec.match_file(rel)


def number_lines(filepath: Path):
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        return [f"{str(i+1).rjust(4)} | {line.rstrip()}" for i, line in enumerate(f)]


def should_skip_dir(path: Path):
    name = path.name
    if name.startswith(".") and name not in {".github"}:
        return True
    return name in IGNORE_DIRS


def build_tree_xml(repo_dir: Path, spec, indent=2):
    xml_lines = []
    seen_dirs = set()

    for root, dirs, files in os.walk(repo_dir):
        # prune ignored/system dirs
        dirs[:] = [d for d in dirs if not should_skip_dir(Path(root) / d)]
        rel_root = Path(root).relative_to(repo_dir)

        # skip duplicate folder entries
        if rel_root not in seen_dirs and rel_root != Path("."):
            depth = len(rel_root.parts)
            xml_lines.append(" " * (indent * depth) + f'<folder name="{escape(rel_root.name)}">')
            seen_dirs.add(rel_root)

        # add visible subfolders and files
        for d in sorted(dirs):
            sub_path = Path(root) / d
            if not is_ignored(sub_path, repo_dir, spec):
                depth = len(Path(root, d).relative_to(repo_dir).parts)
                xml_lines.append(" " * (indent * depth) + f'<folder name="{escape(d)}" />')

        for f in sorted(files):
            file_path = Path(root) / f
            if is_ignored(file_path, repo_dir, spec):
                continue
            if f in SKIP_FILES or file_path.suffix not in VALID_EXTENSIONS:
                continue
            rel = file_path.relative_to(repo_dir)
            lang = detect_lang(file_path.suffix)
            depth = len(rel.parts)
            xml_lines.append(
                " " * (indent * depth)
                + f'<file name="{escape(f)}" path="{escape(str(rel))}" lang="{lang}" />'
            )

    # close all opened folders (flattened style)
    for rel in sorted(seen_dirs, key=lambda p: len(p.parts), reverse=True):
        xml_lines.append(" " * (indent * len(rel.parts)) + "</folder>")

    return "\n".join(xml_lines)


def build_files_xml(repo_dir: Path, spec):
    xml_lines = []
    for root, dirs, files in os.walk(repo_dir):
        dirs[:] = [d for d in dirs if not should_skip_dir(Path(root) / d)]
        for f in sorted(files):
            file_path = Path(root) / f
            if is_ignored(file_path, repo_dir, spec):
                continue
            if f in SKIP_FILES or file_path.suffix not in VALID_EXTENSIONS:
                continue
            # auto-skip large JSON data blobs
            if file_path.suffix == ".json" and file_path.stat().st_size > 10_000:
                continue

            relpath = file_path.relative_to(repo_dir)
            lang = detect_lang(file_path.suffix)
            numbered = "\n".join(number_lines(file_path))
            xml_lines.append(
                f'    <file path="{escape(str(relpath))}" lang="{lang}"><![CDATA[\n{numbered}\n]]></file>'
            )
    return "\n".join(xml_lines)


def main():
    spec = load_gitignore(REPO_DIR)

    xml = []
    xml.append('<?xml version="1.0" encoding="UTF-8"?>')
    xml.append("<codebase>")
    xml.append("  <info>")
    xml.append("    <description>")
    xml.append("      Each file includes prefixed line numbers for reference.")
    xml.append("      These numbers are metadata for navigation only — use them when identifying code regions,")
    xml.append("      Do not include them in any source or patch code being provided to the user.")
    xml.append("      Do reference the line numbers in coversation when it will help navigate the user to the code you want to draw their attention towards.")
    xml.append("    </description>")
    xml.append(f"    <generated>{datetime.datetime.utcnow().isoformat()}Z</generated>")
    xml.append(f"    <root>{escape(str(REPO_DIR))}</root>")
    xml.append("  </info>\n")

    xml.append("  <tree>")
    xml.append(build_tree_xml(REPO_DIR, spec))
    xml.append("  </tree>\n")

    xml.append("  <files>")
    xml.append(build_files_xml(REPO_DIR, spec))
    xml.append("  </files>\n")

    xml.append("</codebase>")

    OUTPUT_FILE.write_text("\n".join(xml), encoding="utf-8")
    print(f"✅ Generated {OUTPUT_FILE}")


if __name__ == "__main__":
    main()

