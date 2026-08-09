#!/usr/bin/env python3.10
"""Run the automated tokenization/lemmatization/dictionary eval.

Usage:
  python3.10 scripts/tokenizer-eval/run_eval.py                        # all 19
  python3.10 scripts/tokenizer-eval/run_eval.py --l2 zh,ja
  python3.10 scripts/tokenizer-eval/run_eval.py --base-url https://python.zerotohero.ca/

Requires the Flask server to already be running (repo rule: this script never
starts or stops it).

Writes:
  tmp/tokenizer-eval/results/{l2}.json
  tmp/tokenizer-eval/results/scorecard.json
  tmp/tokenizer-eval/results/scorecard.md
"""

import argparse
import json
import re
import statistics
import sys
import time
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CORPUS_DIR = ROOT / "tmp" / "tokenizer-eval" / "corpus"
RESULTS_DIR = ROOT / "tmp" / "tokenizer-eval" / "results"
CONFIG_PATH = HERE / "corpus_config.json"
LEMMAS_PATH = HERE / "expected_lemmas.json"
HARD_LEMMAS_PATH = HERE / "hard_lemmas.json"

PRON_LANGS = {"zh", "ja", "ko", "ru", "yue", "ar", "th"}
DICT_SEG = {"zh", "yue", "th"}
CHARS_MODE = {"zh", "ja", "ko", "yue", "th"}
SCRIPTIO_CONTINUA = CHARS_MODE
PUNCT_RE = re.compile(r"^[\W_]+$", re.UNICODE)
GRADES = [(90, "A"), (80, "B"), (70, "C"), (60, "D"), (0, "F")]
WEIGHTS = {
    "fidelity": 25,
    "lemma_cov": 25,
    "spot": 20,
    "dict": 15,
    "pron": 10,
    "rel": 5,
}
NEW_WEIGHTS = {
    "fidelity": 15,
    "sanity": 10,
    "lemma_cov": 10,
    "spot": 20,
    "dict_surface": 15,
    "dict_lemma": 10,
    "pron": 10,
    "rel": 5,
}

KNOWN_NOTES = {
    "tr": "Turkish: Zeyrek stems; apostrophe preservation fixed (SPEC-057 P1)",
    "hi": "Hindi: spaCy xx_ent_wiki_sm (multilingual; no lemmatizer, surface-as-lemma)",
    "he": "Hebrew: surface-as-lemma offline",
    "vi": "Vietnamese: surface-as-lemma; syllable-level splitting acceptable",
    "id": "Indonesian: Simplemma table only; affix coverage depends on table; pipe-table blocks excluded from selection",
    "yue": "Yue: dict-seg; offline main-thread lacks jyutping",
    "ar": "Arabic: CAMeL MLE calima-msa-r13 (GPL v2 server-side); Qalsadi fallback; SAMPA pronunciation; punctuation-adjacent spaces recovered",
    "pt": "Portuguese: popular by historical weight; low recent activity",
}


def token_units(text: str, l2: str):
    """Rough token/unit count for budget capping: words for space-separated
    languages, characters for scriptio-continua languages."""
    if l2 in CHARS_MODE:
        return re.sub(r"\s+", "", text)
    return text.split()


def truncate_to_units(text: str, l2: str, max_units: int) -> str:
    units = token_units(text, l2)
    if len(units) <= max_units:
        return text
    if l2 in CHARS_MODE:
        return "".join(units[:max_units])
    return " ".join(units[:max_units])


def normalize_paragraph(text: str) -> str:
    """Strip Markdown markup so the tokenizer is tested on plain text and
    reconstruction is scored against that same plain text."""
    text = re.sub(r"^#{1,6}\s+", "", text)
    text = re.sub(r"^>\s?", "", text)
    text = re.sub(r"^\s*[-*+]\s+", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[*_`]", "", text)
    text = re.sub(r"\\(.)", r"\1", text)
    text = text.replace("\u202f", " ").replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def is_paragraph(text: str) -> bool:
    if text.lstrip().startswith(("#", "-", "*", "|", ">")):
        return False
    # Exclude pipe-table blocks entirely, including caption lines merged with
    # a table (e.g. the Indonesian numerals table): any row line starting with
    # '|' marks a Markdown table block.
    return not any(line.lstrip().startswith("|") for line in text.splitlines())


def is_content_token(tok) -> bool:
    text = tok.get("text", "")
    if not text or not text.strip():
        return False
    return not PUNCT_RE.match(text)


def primary_lemma(tok) -> str | None:
    lemmas = tok.get("lemmas") or []
    return lemmas[0].get("lemma") if lemmas and lemmas[0].get("lemma") else None


def is_punct_char(ch: str) -> bool:
    return unicodedata.category(ch).startswith(("P", "S"))


def post_json(base: str, path: str, payload: dict, timeout: int = 180):
    resp = requests.post(base.rstrip("/") + path, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def compute_score(l2: str, stats: dict) -> dict:
    scores = {}
    scores["fidelity"] = stats["reconstructionPct"]
    if l2 in DICT_SEG and stats["avgContentTokenLen"] < 1.5:
        scores["fidelity"] = min(scores["fidelity"], 50)
    scores["lemma_cov"] = stats["lemmaCoverage"] * 100
    spot_total = stats["spotTotal"]
    scores["spot"] = (stats["spotPassed"] / spot_total * 100) if spot_total else 100.0
    scores["dict"] = min(100.0, stats["dictHitRate"] / 0.5 * 100)
    avg_ms = stats.get("avgBlockMs")
    scores["rel"] = (
        100.0
        if len(stats["errors"]) == 0 and (avg_ms is None or avg_ms < 2000)
        else 0.0
    )
    applicable = ["fidelity", "lemma_cov", "spot", "dict", "rel"]
    if l2 in PRON_LANGS:
        scores["pron"] = stats["pronunciationCoverage"] * 100
        applicable.append("pron")
    total_weight = sum(WEIGHTS[k] for k in applicable)
    total = sum(scores[k] * WEIGHTS[k] for k in applicable) / total_weight
    grade = next(g for threshold, g in GRADES if total >= threshold)
    return {
        **{k: round(v, 1) for k, v in scores.items()},
        "total": round(total, 1),
        "grade": grade,
        "applicable": applicable,
    }


def compute_score_new(l2: str, stats: dict) -> dict:
    """SPEC-056 v2 rating regime.

    Fixes the v1 blind spots: lemma coverage no longer stands in for
    correctness (expanded hard spot-checks do), dictionary hit rate is
    linear and frequency-weighted (no free 50% credit), a tokenization
    sanity score catches glued/over-merged/char-by-char tokens, dictionary
    coverage is also measured against lemmas (the integration the app
    actually needs), pronunciation only counts word-like tokens, and
    reliability uses p95 latency per the original spec.
    """
    scores = {}
    scores["fidelity"] = stats["reconstructionPct"]
    scores["sanity"] = stats.get("sanityScore", 100.0)
    scores["lemma_cov"] = stats["lemmaCoverage"] * 100
    spot_total = stats["spotTotal"]
    scores["spot"] = (
        stats["spotPassed"] / spot_total * 100 if spot_total else 0.0
    )
    scores["dict_surface"] = (
        stats.get("dictHitRateWeighted", stats["dictHitRate"]) * 100
    )
    scores["dict_lemma"] = stats.get("lemmaDictHitRateWeighted", 0.0) * 100
    p95_ms = stats.get("p95BlockMs")
    spot_errored = any(
        d.get("error") for d in stats.get("spotDetails", [])
    )
    scores["rel"] = (
        100.0
        if (
            len(stats["errors"]) == 0
            and not spot_errored
            and (p95_ms is None or p95_ms < 2000)
        )
        else 0.0
    )
    applicable = [
        "fidelity",
        "sanity",
        "lemma_cov",
        "spot",
        "dict_surface",
        "dict_lemma",
        "rel",
    ]
    if l2 in PRON_LANGS:
        scores["pron"] = (
            stats.get(
                "pronunciationCoverageWords", stats["pronunciationCoverage"]
            )
            * 100
        )
        applicable.append("pron")
    total_weight = sum(NEW_WEIGHTS[k] for k in applicable)
    total = sum(scores[k] * NEW_WEIGHTS[k] for k in applicable) / total_weight
    grade = next(g for threshold, g in GRADES if total >= threshold)
    return {
        **{k: round(v, 1) for k, v in scores.items()},
        "total": round(total, 1),
        "grade": grade,
        "applicable": applicable,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--l2", default="all", help="comma-separated codes or 'all'")
    parser.add_argument("--base-url", default="http://127.0.0.1:5001/")
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=200,
        help="total token budget per language (chars for scriptio-continua)",
    )
    parser.add_argument("--chunk-size", type=int, default=5)
    args = parser.parse_args()

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    expected = json.loads(LEMMAS_PATH.read_text(encoding="utf-8"))
    hard = (
        json.loads(HARD_LEMMAS_PATH.read_text(encoding="utf-8"))
        if HARD_LEMMAS_PATH.exists()
        else {}
    )
    spot_forms = {
        l2: [
            (surface, lemma, "seed")
            for surface, lemma in (expected.get(l2) or {}).items()
        ]
        + [
            (surface, lemma, "hard")
            for surface, lemma in (hard.get(l2) or {}).items()
        ]
        for l2 in config
    }
    l2s = list(config) if args.l2 == "all" else [c.strip() for c in args.l2.split(",")]
    missing = [c for c in l2s if c not in config]
    if missing:
        print(f"[eval] unknown codes: {missing}")
        return 1

    manifest = {}
    if (CORPUS_DIR / "manifest.json").exists():
        manifest = json.loads((CORPUS_DIR / "manifest.json").read_text(encoding="utf-8"))
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    rows = []

    for l2 in l2s:
        md_path = CORPUS_DIR / f"{l2}.md"
        if not md_path.exists():
            print(f"[eval] SKIP {l2}: corpus missing (run fetch_corpus.py)")
            continue
        md = md_path.read_text(encoding="utf-8")
        # Longest paragraphs only, capped at a 200-token total budget per L2.
        all_blocks = [b.strip() for b in re.split(r"\n\s*\n", md) if b.strip()]
        paragraphs = [
            normalize_paragraph(b) for b in all_blocks if is_paragraph(b)
        ]
        paragraphs = [p for p in paragraphs if p]
        paragraphs.sort(key=lambda p: len(token_units(p, l2)), reverse=True)
        blocks = []
        budget = args.max_tokens
        for p in paragraphs:
            n = len(token_units(p, l2))
            if n <= 0:
                continue
            if n <= budget:
                blocks.append(p)
                budget -= n
            else:
                blocks.append(truncate_to_units(p, l2, budget))
                budget = 0
                break
            if budget <= 0:
                break
        if not blocks and all_blocks:
            blocks = [normalize_paragraph(all_blocks[0])]
        errors = []

        # ── Step 1: batch lemmatize ──
        all_tokens = []
        per_block_ms = []
        total_lem_ms = 0
        try:
            for i in range(0, len(blocks), args.chunk_size):
                chunk = blocks[i : i + args.chunk_size]
                t0 = time.perf_counter()
                resp = post_json(
                    args.base_url,
                    "/lemmatize-normalized/batch",
                    {"texts": chunk, "l2": l2},
                )
                dt = (time.perf_counter() - t0) * 1000
                total_lem_ms += dt
                per_block_ms.extend([dt / len(chunk)] * len(chunk))
                all_tokens.extend(resp.get("results", []))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"lemmatize batch failed: {exc}")

        # ── Cap stored/processed output at max_tokens content tokens per L2 ──
        capped_tokens = []
        included_content = 0
        cut_index = None  # (block_index, token_index_exclusive) when capped
        for bi, toks in enumerate(all_tokens):
            if cut_index is not None:
                capped_tokens.append([])
                continue
            out = []
            for ti, tok in enumerate(toks):
                out.append(tok)
                if is_content_token(tok):
                    included_content += 1
                    if included_content >= args.max_tokens:
                        cut_index = (bi, ti + 1)
                        break
            capped_tokens.append(out)
        all_tokens = capped_tokens

        # ── Stats from token stream ──
        content = []
        reconstruction_exact = 0
        reconstruction_total = 0
        for bi, (block, toks) in enumerate(zip(blocks, all_tokens)):
            if not toks:
                continue
            reconstruction_total += 1
            joined = "".join(t.get("text", "") for t in toks)
            if cut_index is not None and bi == cut_index[0]:
                # Partially included block: compare the token prefix against the
                # matching prefix of the original paragraph.
                reconstruction_exact += 1 if joined == block[: len(joined)] else 0
            else:
                reconstruction_exact += 1 if joined == block else 0
            for tok in toks:
                if is_content_token(tok):
                    content.append(tok)
        unique = {}
        for tok in content:
            unique.setdefault(tok["text"], tok)
        unique_tokens = list(unique.values())

        # ── Step 2: batch dictionary lookup ──
        dict_results = {}
        dict_ms = 0
        surface_words = []
        lemma_words = []
        lemma_map = {}
        try:
            if unique_tokens:
                t0 = time.perf_counter()
                surface_words = [t["text"] for t in unique_tokens]
                lemma_map = {
                    t["text"]: primary_lemma(t) for t in unique_tokens
                }
                lemma_words = sorted(
                    {l for l in lemma_map.values() if l}
                )
                payload = {
                    "words": [
                        {"text": w, "l2": l2} for w in surface_words + lemma_words
                    ]
                }
                dict_results = post_json(
                    args.base_url, "/dictionary/lookup-batch", payload
                ).get("results", {})
                dict_ms = (time.perf_counter() - t0) * 1000
        except Exception as exc:  # noqa: BLE001
            errors.append(f"dictionary lookup failed: {exc}")

        # ── Step 2b: deterministic lemma spot-checks ──
        spot_passed = 0
        spot_passed_any = 0
        spot_total = 0
        seed_passed = 0
        seed_total = 0
        spot_details = []
        for surface, expected_lemma, source in spot_forms.get(l2, []):
            spot_total += 1
            if source == "seed":
                seed_total += 1
            detail = {
                "surface": surface,
                "expected": expected_lemma,
                "actual": None,
                "pass": False,
                "pass_any": False,
                "source": source,
            }
            try:
                resp = post_json(
                    args.base_url,
                    "/lemmatize-normalized",
                    {"text": surface, "l2": l2},
                )
                tokens = resp.get("tokens", [])
                hit = next((t for t in tokens if t.get("text") == surface), None)
                if hit is None:
                    hit = next((t for t in tokens if is_content_token(t)), None)
                lemma_objs = (hit or {}).get("lemmas", [])
                lemmas = [l.get("lemma") for l in lemma_objs if l.get("lemma")]
                detail["actual"] = lemmas[0] if lemmas else None
                detail["pass"] = bool(lemmas) and lemmas[0] == expected_lemma
                detail["pass_any"] = expected_lemma in lemmas
                spot_passed += 1 if detail["pass"] else 0
                spot_passed_any += 1 if detail["pass_any"] else 0
                if source == "seed" and detail["pass"]:
                    seed_passed += 1
            except Exception as exc:  # noqa: BLE001
                detail["error"] = str(exc)
            spot_details.append(detail)

        n_content = len(content)
        n_unique = len(unique_tokens)
        lemma_cov = (
            sum(1 for t in content if any(l.get("lemma") for l in t.get("lemmas", [])))
            / n_content
            if n_content
            else 0
        )
        pron_cov = (
            sum(1 for t in content if t.get("pronunciation")) / n_content
            if n_content
            else 0
        )
        freq = Counter(t["text"] for t in content)

        def dict_hit_for(word):
            return bool(dict_results.get(word))

        dict_hit = (
            sum(1 for w in surface_words if dict_hit_for(w)) / len(surface_words)
            if surface_words
            else 0
        )
        dict_hit_weighted = (
            sum(freq[w] for w in surface_words if dict_hit_for(w)) / n_content
            if n_content
            else 0
        )
        with_lemma = [w for w in surface_words if lemma_map.get(w)]
        lemma_dict_hit = (
            sum(1 for w in with_lemma if dict_hit_for(lemma_map[w]))
            / len(with_lemma)
            if with_lemma
            else 0
        )
        lemma_dict_hit_weighted = (
            sum(freq[w] for w in with_lemma if dict_hit_for(lemma_map[w]))
            / sum(freq[w] for w in with_lemma)
            if with_lemma
            else 0
        )
        avg_token_len = (
            sum(len(t["text"]) for t in content) / n_content if n_content else 0
        )
        whitespace_frac = (
            sum(1 for t in content if any(ch.isspace() for ch in t["text"]))
            / n_content
            if n_content
            else 0
        )
        glued_frac = (
            sum(
                1
                for t in content
                if is_punct_char(t["text"][0]) or is_punct_char(t["text"][-1])
            )
            / n_content
            if n_content
            else 0
        )
        overmerged_frac = (
            sum(1 for t in content if len(t["text"]) > 20) / n_content
            if n_content and l2 in SCRIPTIO_CONTINUA
            else 0
        )
        sanity_score = (
            100.0 - 100 * whitespace_frac - 50 * glued_frac - 50 * overmerged_frac
        )
        if l2 in DICT_SEG and avg_token_len < 1.5:
            sanity_score = min(sanity_score, 50.0)
        sanity_score = max(0.0, round(sanity_score, 1))
        word_like = [t for t in content if t["text"].isalpha()]
        pron_cov_words = (
            sum(1 for t in word_like if t.get("pronunciation")) / len(word_like)
            if word_like
            else 0
        )
        single_letter_frac = (
            sum(
                1
                for t in content
                if len(t["text"]) == 1 and t["text"].isalpha()
            )
            / n_content
            if n_content
            else 0
        )
        digit_frac = (
            sum(1 for t in content if any(ch.isdigit() for ch in t["text"]))
            / n_content
            if n_content
            else 0
        )
        sorted_ms = sorted(per_block_ms)
        p95 = sorted_ms[int(len(sorted_ms) * 0.95) - 1] if sorted_ms else None
        avg_ms = statistics.mean(per_block_ms) if per_block_ms else None

        stats = {
            "blocks": reconstruction_total,
            "contentTokenCap": args.max_tokens,
            "contentTokensIncluded": len(content),
            "capped": cut_index is not None,
            "tokenBudget": args.max_tokens,
            "tokens": n_content,
            "uniqueContentTokens": n_unique,
            "reconstructionExact": reconstruction_exact,
            "reconstructionPct": (
                reconstruction_exact / reconstruction_total * 100
                if reconstruction_total
                else 0
            ),
            "lemmaCoverage": round(lemma_cov, 4),
            "dictHitRate": round(dict_hit, 4),
            "dictHitRateWeighted": round(dict_hit_weighted, 4),
            "lemmaDictHitRate": round(lemma_dict_hit, 4),
            "lemmaDictHitRateWeighted": round(lemma_dict_hit_weighted, 4),
            "pronunciationCoverage": round(pron_cov, 4),
            "pronunciationCoverageWords": round(pron_cov_words, 4),
            "avgContentTokenLen": round(avg_token_len, 2),
            "sanityScore": sanity_score,
            "whitespaceTokenFraction": round(whitespace_frac, 4),
            "gluedTokenFraction": round(glued_frac, 4),
            "overmergedTokenFraction": round(overmerged_frac, 4),
            "singleLetterTokenFraction": round(single_letter_frac, 4),
            "digitTokenFraction": round(digit_frac, 4),
            "spotPassed": spot_passed,
            "spotPassedAny": spot_passed_any,
            "spotTotal": spot_total,
            "spotErrorCount": sum(1 for d in spot_details if d.get("error")),
            "spotDetails": spot_details,
            "errors": errors,
            "totalLemmatizeMs": round(total_lem_ms, 1),
            "dictionaryLookupMs": round(dict_ms, 1),
            "avgBlockMs": round(avg_ms, 1) if avg_ms is not None else None,
            "p95BlockMs": round(p95, 1) if p95 is not None else None,
        }
        legacy_stats = dict(stats)
        legacy_stats["spotPassed"] = seed_passed
        legacy_stats["spotTotal"] = seed_total
        legacy_score = compute_score(l2, legacy_stats)
        score = compute_score_new(l2, stats)
        stats["legacyScore"] = legacy_score
        stats["score"] = score

        result = {
            "l2": l2,
            "corpus": manifest.get("sources", {}).get(l2, {}),
            "lemmatize": {
                "request": {"texts": blocks, "l2": l2},
                "response": {"results": all_tokens},
                "latencyMs": stats["totalLemmatizeMs"],
            },
            "dictionary": {
                "request": {
                    "words": [{"text": w, "l2": l2} for w in surface_words],
                    "lemmaWords": [
                        {"text": w, "l2": l2} for w in lemma_words
                    ],
                },
                "response": {"results": dict_results},
                "latencyMs": stats["dictionaryLookupMs"],
            },
            "stats": stats,
        }
        (RESULTS_DIR / f"{l2}.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        rows.append((l2, result))
        print(
            f"[eval] {l2}: total={score['total']} ({score['grade']}) "
            f"tokens={n_content} lemma_cov={lemma_cov:.0%} dict_hit={dict_hit:.0%}"
        )

    # ── Scorecard ──
    rows.sort(key=lambda item: item[1]["stats"]["score"]["total"], reverse=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    lines = [
        f"# Tokenizer Eval Scorecard ({now})",
        "",
        f"Languages: {len(rows)}/{len(l2s)} · base URL: {args.base_url}",
        "",
        "| L2 | Tokens | Lemma cov. | Spot | Dict surf. | Dict lem. | Pron. | p95 ms | Old | New | Grade | Notes |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    scorecard_json = {"generated_at": now, "base_url": args.base_url, "languages": {}}
    for l2, result in rows:
        s = result["stats"]
        sc = s["score"]
        legacy = s.get("legacyScore", {})
        notes = KNOWN_NOTES.get(l2, "")
        if s["errors"]:
            notes = (notes + "; " if notes else "") + "; ".join(s["errors"])
        if s["digitTokenFraction"] > 0.10:
            notes = (
                (notes + "; " if notes else "")
                + f"{s['digitTokenFraction']:.0%} digit/Latin-label tokens in sample"
            )
        if (
            l2 not in CHARS_MODE
            and s["singleLetterTokenFraction"] > 0.15
        ):
            notes = (
                (notes + "; " if notes else "")
                + f"{s['singleLetterTokenFraction']:.0%} single-letter tokens (initials/proper nouns)"
            )
        if s["spotPassed"] != s["spotPassedAny"]:
            notes = (
                (notes + "; " if notes else "")
                + f"spot primary {s['spotPassed']}/{s['spotTotal']}, any-candidate {s['spotPassedAny']}/{s['spotTotal']}"
            )
        if s.get("spotErrorCount"):
            notes = (
                (notes + "; " if notes else "")
                + f"{s['spotErrorCount']}/{s['spotTotal']} spot checks errored (HTTP 5xx)"
            )
        if s["lemmaDictHitRateWeighted"] > s["dictHitRateWeighted"] + 0.05:
            notes = (
                (notes + "; " if notes else "")
                + f"lemma lookup would raise dict coverage {s['dictHitRateWeighted']:.0%}→{s['lemmaDictHitRateWeighted']:.0%}"
            )
        pron_cell = (
            f"{s['pronunciationCoverageWords']:.0%}"
            if l2 in PRON_LANGS
            else "—"
        )
        lines.append(
            f"| {l2} | {s['tokens']} | {s['lemmaCoverage']:.0%} | "
            f"{s['spotPassed']}/{s['spotTotal']} | "
            f"{s['dictHitRateWeighted']:.0%} | "
            f"{s['lemmaDictHitRateWeighted']:.0%} | "
            f"{pron_cell} | "
            f"{s['p95BlockMs'] if s['p95BlockMs'] is not None else '—'} | "
            f"{legacy.get('total', '—')} | "
            f"{sc['total']} | {sc['grade']} | {notes} |"
        )
        scorecard_json["languages"][l2] = {
            "score": sc,
            "legacy_score": legacy,
            "stats": {
                k: v
                for k, v in s.items()
                if k not in ("spotDetails", "score", "legacyScore")
            },
            "notes": notes,
        }
    (RESULTS_DIR / "scorecard.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (RESULTS_DIR / "scorecard.json").write_text(
        json.dumps(scorecard_json, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[eval] scorecard written: {RESULTS_DIR / 'scorecard.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
