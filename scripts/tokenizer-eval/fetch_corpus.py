#!/usr/bin/env python3.10
"""Fetch one rich Wikipedia article per popular L2 and store it as Markdown.

Usage:
  python3.10 scripts/tokenizer-eval/fetch_corpus.py               # all 19
  python3.10 scripts/tokenizer-eval/fetch_corpus.py --l2 zh,en

Writes:
  tmp/tokenizer-eval/corpus/{l2}.md
  tmp/tokenizer-eval/corpus/manifest.json
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import markdownify
import requests
from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CORPUS_DIR = ROOT / "tmp" / "tokenizer-eval" / "corpus"
CONFIG_PATH = HERE / "corpus_config.json"
UA = (
    "LanguagePlayerTokenizerEval/1.0 "
    "(https://languageplayer.io; jon.long@zerotohero.ca)"
)

# Scriptio-continua languages: count validation units as characters.
CHARS_MODE = {"zh", "ja", "ko", "yue", "th"}

STRIP_SELECTORS = [
    "style", "script", "sup.reference", ".infobox", ".navbox", ".metadata",
    ".mw-editsection", ".hatnote", ".noprint", ".mw-jump-link", ".reflist",
    "ol.references", "span.mw-ref", "figure", "figcaption", "#toc",
    "table.infobox", ".sistersitebox", ".ambox", ".mbox-small",
    ".vertical-navbox", ".side-box", ".plainlinks",
]


def count_words(text: str, mode: str) -> int:
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"[#*_`>\[\]()!|~]", " ", text)
    if mode == "chars":
        return len(re.sub(r"\s+", "", text))
    return len(re.findall(r"\w+", text, re.UNICODE))


def html_to_markdown(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for selector in STRIP_SELECTORS:
        for el in soup.select(selector):
            el.decompose()
    body = soup.select_one("main, .mw-parser-output, body")
    if body is None:
        body = soup
    md = markdownify.markdownify(str(body), heading_style="ATX", bullets="-")
    return re.sub(r"\n{3,}", "\n\n", md).strip()


def validate_markdown(md: str, mode: str) -> dict:
    blocks = [b.strip() for b in re.split(r"\n\s*\n", md) if b.strip()]
    paragraphs = [
        b for b in blocks
        if not b.lstrip().startswith(("#", "-", "*", "|", ">"))
    ]
    long_paragraphs = [b for b in paragraphs if count_words(b, mode) >= 40]
    total = sum(count_words(b, mode) for b in blocks)
    has_heading = bool(re.search(r"^#{1,6}\s", md, re.M))
    has_link = bool(re.search(r"\[[^\]]+\]\([^)]+\)", md))
    return {
        "ok": len(long_paragraphs) >= 3 and total >= 300 and has_heading and has_link,
        "long_paragraphs": len(long_paragraphs),
        "total_units": total,
        "has_heading": has_heading,
        "has_link": has_link,
    }


def fetch_article(lang: str, title: str):
    url = (
        f"https://{lang}.wikipedia.org/api/rest_v1/page/html/"
        f"{requests.utils.quote(title, safe='')}"
    )
    resp = requests.get(
        url,
        headers={"User-Agent": UA, "Accept": "text/html; charset=utf-8"},
        timeout=30,
    )
    resp.raise_for_status()
    etag = resp.headers.get("ETag") or resp.headers.get("Last-Modified")
    return url, resp.text, etag


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--l2", default="all", help="comma-separated codes or 'all'")
    args = parser.parse_args()

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    l2s = list(config) if args.l2 == "all" else [c.strip() for c in args.l2.split(",")]
    missing = [c for c in l2s if c not in config]
    if missing:
        print(f"[eval] unknown codes: {missing}")
        return 1

    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = CORPUS_DIR / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest.setdefault("sources", {})

    ok = 0
    for l2 in l2s:
        entry = config[l2]
        mode = "chars" if l2 in CHARS_MODE else "words"
        titles = entry.get("titles") or [entry.get("title")]
        last_error = None
        saved = False
        for title in titles:
            try:
                url, html, etag = fetch_article(entry["lang"], title)
                md = html_to_markdown(html)
                validation = validate_markdown(md, mode)
                if not validation["ok"]:
                    last_error = f"{title}: richness check failed {validation}"
                    continue
                (CORPUS_DIR / f"{l2}.md").write_text(md + "\n", encoding="utf-8")
                manifest["sources"][l2] = {
                    "lang": entry["lang"],
                    "title": title,
                    "url": url,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                    "etag": etag,
                    "validation": validation,
                }
                print(f"[eval] OK {l2} <- {title} ({validation['total_units']} units)")
                ok += 1
                saved = True
                break
            except requests.HTTPError as exc:
                status = exc.response.status_code if exc.response is not None else "?"
                last_error = f"{title}: HTTP {status}"
            except Exception as exc:  # noqa: BLE001 - report and continue
                last_error = f"{title}: {exc}"
        if not saved:
            print(f"[eval] FAIL {l2}: {last_error}")
        time.sleep(0.4)

    manifest["generated_at"] = datetime.now(timezone.utc).isoformat()
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[eval] corpus saved: {ok}/{len(l2s)}")
    return 0 if ok == len(l2s) else 1


if __name__ == "__main__":
    sys.exit(main())
