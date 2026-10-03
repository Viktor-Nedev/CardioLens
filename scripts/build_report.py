"""Render docs/REPORT.md to a print-ready A4 PDF with headless Chrome or Edge.

Usage (from the repository root):
    backend/.venv/Scripts/python scripts/build_report.py      # Windows
    backend/.venv/bin/python scripts/build_report.py          # macOS / Linux

Options: --max-pages N (default 6, exit code 1 when exceeded), --html to also keep
the intermediate HTML. Needs markdown-it-py (backend/requirements-dev.txt) and a
Chromium-based browser; set CHROME_PATH if it is not found automatically.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from markdown_it import MarkdownIt

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
SOURCE = DOCS / "REPORT.md"
TARGET = DOCS / "REPORT.pdf"

BROWSERS = [
    os.environ.get("CHROME_PATH", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
]

CSS = """
@page {
  size: A4;
  margin: 15mm 16mm 15mm;
  @bottom-left { content: "CardioLens · project report"; font: 7pt var(--sans); color: #7b8594; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7pt var(--sans); color: #7b8594; }
}
:root {
  --sans: "Segoe UI", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --mono: "Cascadia Mono", Consolas, "SFMono-Regular", Menlo, monospace;
  --ink: #142033;
  --ink-2: #44505f;
  --rule: #dde3ea;
  --accent: #136f9c;
  --accent-bar: #5cc8f5;
  --risk: #d03b3b;
}
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 9.3pt/1.4 var(--sans); color: var(--ink); background: #fff; }
h1 { font-size: 19pt; line-height: 1.15; margin: 0 0 2pt; letter-spacing: -0.01em; }
h1 + p { margin: 0 0 7pt; padding-bottom: 6pt; border-bottom: 2.5pt solid var(--accent-bar); color: var(--ink-2); }
h1 + p strong { font-weight: 600; }
h2 { font-size: 12pt; margin: 11pt 0 4pt; padding-top: 4pt; border-top: 0.75pt solid var(--rule); break-after: avoid; }
h3 { font-size: 10pt; margin: 8pt 0 3pt; break-after: avoid; }
p { margin: 0 0 4.5pt; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 4.5pt; padding-left: 14pt; }
li { margin: 0 0 1pt; }
li > ul, li > ol { margin: 1pt 0 1.5pt; }
li > p { margin: 0; }
strong { font-weight: 650; }
a { color: var(--accent); text-decoration: none; }
code { font: 0.86em var(--mono); background: #f1f4f7; border-radius: 2pt; padding: 0.5pt 2.5pt; }
blockquote {
  margin: 6pt 0 7pt; padding: 5pt 9pt; border-left: 2.5pt solid var(--risk);
  background: #fdf1f1; border-radius: 0 3pt 3pt 0; color: #5a1f1f; break-inside: avoid;
}
blockquote p { margin: 0; }
table { width: 100%; border-collapse: collapse; margin: 3pt 0 7pt; font-size: 8pt; line-height: 1.3; break-inside: avoid; }
table:not(:has(th:nth-child(4))) { width: auto; min-width: 55%; }
th { text-align: left; font-weight: 600; background: #eef3f8; border-bottom: 1pt solid #c9d3de; }
th, td { padding: 2.4pt 5pt; vertical-align: top; }
td { border-bottom: 0.5pt solid var(--rule); }
tr:nth-child(even) td { background: #f8fafc; }
p:has(> img) { margin: 6pt 0 8pt; text-align: center; font-size: 7.8pt; line-height: 1.35; color: var(--ink-2); break-inside: avoid; }
p:has(> img) em { display: block; max-width: 92%; margin: 0 auto; }
img { display: block; max-width: 100%; max-height: 84mm; margin: 0 auto 3.5pt; border-radius: 3pt; }
hr { border: 0; border-top: 0.75pt solid var(--rule); margin: 8pt 0; }
"""


def find_browser() -> str:
    for candidate in BROWSERS:
        if not candidate:
            continue
        path = candidate if os.path.isabs(candidate) else shutil.which(candidate)
        if path and os.path.exists(path):
            return path
    sys.exit("No Chrome, Chromium or Edge found; set CHROME_PATH to the browser executable.")


def render_html(markdown: str) -> str:
    md = MarkdownIt("commonmark", {"html": True}).enable(["table", "strikethrough"])
    body = md.render(markdown)
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<title>CardioLens: project report</title>"
        f"<base href='{DOCS.as_uri()}/'><style>{CSS}</style></head>"
        f"<body>{body}</body></html>"
    )


def count_pages(pdf: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page(?![A-Za-z])", pdf))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--max-pages", type=int, default=6)
    parser.add_argument("--html", action="store_true", help="keep docs/REPORT.html next to the PDF")
    args = parser.parse_args()

    html = render_html(SOURCE.read_text(encoding="utf-8"))
    browser = find_browser()
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "report.html"
        page.write_text(html, encoding="utf-8")
        subprocess.run(
            [
                browser,
                "--headless",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                "--no-pdf-header-footer",
                f"--user-data-dir={Path(tmp) / 'profile'}",
                f"--print-to-pdf={TARGET}",
                page.as_uri(),
            ],
            check=True,
            capture_output=True,
            timeout=180,
        )
    if args.html:
        (DOCS / "REPORT.html").write_text(html, encoding="utf-8")

    pages = count_pages(TARGET.read_bytes())
    print(f"{TARGET.relative_to(ROOT)}: {pages} pages (limit {args.max_pages})")
    if pages > args.max_pages:
        sys.exit(1)


if __name__ == "__main__":
    main()
