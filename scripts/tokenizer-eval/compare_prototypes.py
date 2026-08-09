#!/usr/bin/env python3.10
"""SPEC-057 Phase 2 prototype comparison: CAMeL Tools (ar) and Stanza (he)
against the live Flask engines on the SPEC-056 corpus.

Usage:
  python3.10 scripts/tokenizer-eval/compare_prototypes.py
  python3.10 scripts/tokenizer-eval/compare_prototypes.py --l2 ar
  python3.10 scripts/tokenizer-eval/compare_prototypes.py --base-url https://...

Requirements:
  - camel-tools + `camel_data -i light` for Arabic
  - stanza + `stanza.download('he', processors='tokenize,mwt,pos,lemma')` for
    Hebrew (research-only)
  - Flask server already running (repo rule: this script never starts/stops it)

The prototypes are measured with the same paragraph selection, 200-token cap,
and reconstruction/lemma/dict-hit metrics as run_eval.py. CAMeL's MSA
morphology/MLE packages (calima-msa-r13) are GPL v2 and are now the primary
Arabic engine server-side (same policy as Qalsadi GPL-3.0; the LDC-licensed
SAMA 3.1 package is excluded). Stanza Hebrew remains research-only — it is
trained on UD Hebrew HTB (CC BY-NC-SA 4.0), a production blocker.

Writes:
  tmp/tokenizer-eval/prototypes/{l2}.json
"""

import argparse
import json
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_eval import (  # noqa: E402
    CONFIG_PATH,
    CORPUS_DIR,
    is_content_token,
    is_paragraph,
    normalize_paragraph,
    post_json,
    token_units,
    truncate_to_units,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PROTO_DIR = ROOT / "tmp" / "tokenizer-eval" / "prototypes"

SPOT_CHECKS = {
    "ar": {
        "كتبتها": "كتب",
        "أعني": "عنى",
        "يتحدثها": "تحدث",
        "اللغات": "لغة",
        "المتحدثون": "متحدث",
    },
    "he": {
        "שפות": "שפה",
        "יהודים": "יהודי",
        "מדוברת": "מדובר",
        "העברית": "עברית",
    },
}

KNOWN_QALSADI_BUGS = ["كتبتها", "أعني", "يتحدثها"]


def select_blocks(l2: str, max_tokens: int) -> list:
    """Same paragraph selection + 200-token budget as run_eval.main()."""
    md_path = CORPUS_DIR / f"{l2}.md"
    if not md_path.exists():
        print(f"[compare] SKIP {l2}: corpus missing (run fetch_corpus.py)")
        return []
    md = md_path.read_text(encoding="utf-8")
    all_blocks = [b.strip() for b in re.split(r"\n\s*\n", md) if b.strip()]
    paragraphs = [
        normalize_paragraph(b) for b in all_blocks if is_paragraph(b)
    ]
    paragraphs = [p for p in paragraphs if p]
    paragraphs.sort(key=lambda p: len(token_units(p, l2)), reverse=True)
    blocks = []
    budget = max_tokens
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
    return blocks


def cap_streams(blocks: list, streams: list, max_tokens: int):
    """Cap each block's token stream at max_tokens content tokens, exactly as
    run_eval.main() does (including the partial-block prefix rule)."""
    capped = []
    included = 0
    cut_index = None
    for bi, toks in enumerate(streams):
        if cut_index is not None:
            capped.append([])
            continue
        out = []
        for ti, tok in enumerate(toks):
            out.append(tok)
            if is_content_token(tok):
                included += 1
                if included >= max_tokens:
                    cut_index = (bi, ti + 1)
                    break
        capped.append(out)
    return capped, cut_index


def emit_gap(tokens: list, gap: str) -> None:
    for ch in gap:
        tokens.append({"text": ch, "lemmas": [], "pronunciation": None})


def server_streams(blocks: list, l2: str, base_url: str, chunk_size: int = 5):
    """Batch-lemmatize blocks through the live server (warm), like run_eval."""
    streams = []
    per_block_ms = []
    if len(blocks) == 1:
        # Single block: one warm-up call, then the measured call below, so the
        # reported number reflects the warm cache like run_eval's scorecard.
        post_json(
            base_url,
            "/lemmatize-normalized/batch",
            {"texts": blocks, "l2": l2},
        )
    for i in range(0, len(blocks), chunk_size):
        chunk = blocks[i : i + chunk_size]
        t0 = time.perf_counter()
        resp = post_json(
            base_url, "/lemmatize-normalized/batch", {"texts": chunk, "l2": l2}
        )
        dt = (time.perf_counter() - t0) * 1000
        per_block_ms.extend([dt / len(chunk)] * len(chunk))
        streams.extend(resp.get("results", []))
    return streams, per_block_ms


class CamelPrototype:
    """CAMeL Tools MLE disambiguator (calima-msa-r13) + simple_word_tokenize."""

    name = "camel-mle-calima-msa-r13"

    def __init__(self):
        t0 = time.perf_counter()
        from camel_tools.disambig.mle import MLEDisambiguator
        from camel_tools.tokenizers.word import simple_word_tokenize
        from camel_tools.utils.dediac import dediac_ar

        self.mle = MLEDisambiguator.pretrained()
        self.tokenize = simple_word_tokenize
        self.dediac = dediac_ar
        self.load_ms = round((time.perf_counter() - t0) * 1000, 1)

    def lemmatize_block(self, text: str) -> list:
        toks = self.tokenize(text)
        out = self.mle.disambiguate(toks)
        lemma_by_word = {}
        pos_by_word = {}
        for dw in out:
            analysis = dw.analyses[0].analysis if dw.analyses else {}
            lemma_by_word[dw.word] = self.dediac(analysis.get("lex") or dw.word)
            pos_by_word[dw.word] = analysis.get("pos") or ""
        tokens = []
        pos = 0
        for tok in toks:
            idx = text.find(tok, pos)
            if idx == -1:
                # Shouldn't happen (tokens come from findall on the same text),
                # but keep reconstruction safe if a tokenizer quirk shows up.
                while pos < len(text) and text.find(tok, pos) == -1:
                    tokens.append({"text": text[pos], "lemmas": [], "pronunciation": None})
                    pos += 1
                idx = text.find(tok, pos)
                if idx == -1:
                    continue
            if idx > pos:
                emit_gap(tokens, text[pos:idx])
            tokens.append(
                {
                    "text": tok,
                    "lemmas": [{"lemma": lemma_by_word[tok], "part_of_speech": pos_by_word[tok]}],
                    "pronunciation": None,
                }
            )
            pos = idx + len(tok)
        emit_gap(tokens, text[pos:])
        return tokens


class StanzaPrototype:
    """Stanza Hebrew pipeline (tokenize,mwt,pos,lemma) with byte-exact
    reconstruction from token spans."""

    name = "stanza-he-htb"

    def __init__(self):
        t0 = time.perf_counter()
        # Stanza 1.14's torch.load(weights_only=True) cannot unpickle its own
        # legacy checkpoint format (Unsupported class _codecs.encode). This is
        # a local-prototype workaround for trusted Stanford models; NOT for
        # production adoption (license blocker anyway).
        import torch

        _orig_load = torch.load

        def _load(*args, **kwargs):
            kwargs.pop("weights_only", None)
            return _orig_load(*args, **kwargs)

        torch.load = _load
        import stanza

        self.nlp = stanza.Pipeline(
            lang="he",
            processors="tokenize,mwt,pos,lemma",
            download_method=None,
            verbose=False,
        )
        self.load_ms = round((time.perf_counter() - t0) * 1000, 1)

    def lemmatize_block(self, text: str) -> list:
        doc = self.nlp(text)
        tokens = []
        pos = 0
        for sent in doc.sentences:
            for tok in sent.tokens:
                start = getattr(tok, "start_char", None)
                end = getattr(tok, "end_char", None)
                if (
                    start is None
                    or end is None
                    or text[start:end] != tok.text
                ):
                    start = text.find(tok.text, pos)
                    if start == -1:
                        continue
                    end = start + len(tok.text)
                if start > pos:
                    emit_gap(tokens, text[pos:start])
                words = tok.words or []
                if len(words) <= 1:
                    word = words[0] if words else None
                    lemma = (word.lemma or word.text or tok.text) if word else tok.text
                    upos = word.upos if word else ""
                    tokens.append(
                        {
                            "text": text[start:end],
                            "lemmas": [{"lemma": lemma, "part_of_speech": upos}],
                            "pronunciation": None,
                        }
                    )
                    pos = end
                    continue
                # MWT token: emit one unified token per UD word. Word texts are
                # subsequences of the token span, so reconstruction stays exact.
                wpos = start
                for word in words:
                    wtxt = word.text or ""
                    idx = text.find(wtxt, wpos)
                    if idx == -1 or idx >= end:
                        continue
                    if idx > wpos:
                        emit_gap(tokens, text[wpos:idx])
                    tokens.append(
                        {
                            "text": text[idx : idx + len(wtxt)],
                            "lemmas": [{"lemma": word.lemma or wtxt, "part_of_speech": word.upos or ""}],
                            "pronunciation": None,
                        }
                    )
                    wpos = idx + len(wtxt)
                pos = end
        emit_gap(tokens, text[pos:])
        return tokens


PROTOTYPES = {
    "ar": CamelPrototype,
    "he": StanzaPrototype,
}


def prototype_streams(prototype, blocks: list):
    """Run each block through the prototype; first block is warm-up (reported
    separately), the rest are averaged for the warm latency."""
    streams = []
    block_ms = []
    cold_ms = None
    if len(blocks) == 1:
        # One block only: warm the cache first, then measure, so the reported
        # number is comparable to run_eval's warm-cache scorecard.
        t0 = time.perf_counter()
        prototype.lemmatize_block(blocks[0])
        cold_ms = round((time.perf_counter() - t0) * 1000, 1)
    for i, block in enumerate(blocks):
        t0 = time.perf_counter()
        streams.append(prototype.lemmatize_block(block))
        dt = (time.perf_counter() - t0) * 1000
        if len(blocks) == 1:
            block_ms.append(dt)
        elif i == 0:
            cold_ms = round(dt, 1)
        else:
            block_ms.append(dt)
    warm_ms = round(statistics.mean(block_ms), 1) if block_ms else None
    return streams, cold_ms, warm_ms


def compute_stats(
    blocks: list,
    streams: list,
    l2: str,
    base_url: str,
    max_tokens: int,
    normalize_lemma=None,
):
    capped, cut_index = cap_streams(blocks, streams, max_tokens)
    content = []
    reconstruction_exact = 0
    reconstruction_total = 0
    for bi, (block, toks) in enumerate(zip(blocks, capped)):
        if not toks:
            continue
        reconstruction_total += 1
        joined = "".join(t.get("text", "") for t in toks)
        if cut_index is not None and bi == cut_index[0]:
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

    dict_results = {}
    if unique_tokens:
        dict_results = post_json(
            base_url,
            "/dictionary/lookup-batch",
            {"words": [{"text": t["text"], "l2": l2} for t in unique_tokens]},
        ).get("results", {})

    n_content = len(content)
    n_unique = len(unique_tokens)
    lemma_cov = (
        sum(1 for t in content if any(l.get("lemma") for l in t.get("lemmas", [])))
        / n_content
        if n_content
        else 0
    )
    dict_hit = (
        sum(1 for t in unique_tokens if dict_results.get(t["text"])) / n_unique
        if n_unique
        else 0
    )

    def norm(lemma):
        return normalize_lemma(lemma) if normalize_lemma else lemma

    changed = sum(
        1
        for t in content
        if any(norm(l.get("lemma", "")) != norm(t["text"]) for l in t.get("lemmas", []))
    )
    samples = []
    for t in content:
        if len(samples) >= 15:
            break
        if any(norm(l.get("lemma", "")) != norm(t["text"]) for l in t.get("lemmas", [])):
            samples.append(
                {
                    "surface": t["text"],
                    "lemma": next(
                        norm(l.get("lemma", ""))
                        for l in t.get("lemmas", [])
                        if l.get("lemma")
                    ),
                }
            )
    return {
        "blocks": reconstruction_total,
        "tokens": n_content,
        "uniqueContentTokens": n_unique,
        "reconstructionPct": round(
            reconstruction_exact / reconstruction_total * 100 if reconstruction_total else 0,
            1,
        ),
        "lemmaCoverage": round(lemma_cov, 4),
        "dictHitRate": round(dict_hit, 4),
        "avgContentTokenLen": round(
            sum(len(t["text"]) for t in content) / n_content if n_content else 0, 2
        ),
        "lemmaChangedTokens": changed,
        "lemmaChangeSamples": samples,
    }


def spot_check(engine, l2: str, base_url: str, expected: dict) -> dict:
    details = []
    passed = 0
    for surface, expected_lemma in expected.items():
        actual = None
        lemmas = []
        try:
            if engine == "server":
                resp = post_json(
                    base_url,
                    "/lemmatize-normalized",
                    {"text": surface, "l2": l2},
                )
                toks = resp.get("tokens", [])
                hit = next((t for t in toks if t.get("text") == surface), None)
                hit = hit or next((t for t in toks if is_content_token(t)), None)
                lemmas = [l.get("lemma") for l in (hit or {}).get("lemmas", []) if l.get("lemma")]
            else:
                toks = engine.lemmatize_block(surface)
                lemmas = [
                    l.get("lemma")
                    for t in toks
                    if is_content_token(t)
                    for l in t.get("lemmas", [])
                    if l.get("lemma")
                ]
        except Exception as exc:  # noqa: BLE001
            lemmas = [f"ERROR: {exc}"]
        actual = next((l for l in lemmas if l == expected_lemma), None) or (lemmas[0] if lemmas else None)
        ok = actual == expected_lemma
        passed += 1 if ok else 0
        details.append(
            {"surface": surface, "expected": expected_lemma, "actual": actual, "pass": ok}
        )
    return {"passed": passed, "total": len(expected), "details": details}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--l2", default="ar,he")
    parser.add_argument("--base-url", default="http://127.0.0.1:5001/")
    parser.add_argument("--max-tokens", type=int, default=200)
    args = parser.parse_args()

    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    l2s = [c.strip() for c in args.l2.split(",")]
    missing = [c for c in l2s if c not in config or c not in PROTOTYPES]
    if missing:
        print(f"[compare] unsupported codes: {missing}")
        return 1

    PROTO_DIR.mkdir(parents=True, exist_ok=True)
    for l2 in l2s:
        blocks = select_blocks(l2, args.max_tokens)
        if not blocks:
            continue
        try:
            prototype = PROTOTYPES[l2]()
        except Exception as exc:  # noqa: BLE001
            print(f"[compare] {l2}: prototype unavailable: {exc}")
            continue

        server_streams_out, server_ms = server_streams(blocks, l2, args.base_url)
        proto_streams_out, cold_ms, warm_ms = prototype_streams(prototype, blocks)

        normalize = (
            prototype.dediac
            if l2 == "ar"
            else None
        )
        server_stats = compute_stats(
            blocks, server_streams_out, l2, args.base_url, args.max_tokens, normalize
        )
        proto_stats = compute_stats(
            blocks, proto_streams_out, l2, args.base_url, args.max_tokens, normalize
        )
        server_spot = spot_check("server", l2, args.base_url, SPOT_CHECKS[l2])
        proto_spot = spot_check(prototype, l2, args.base_url, SPOT_CHECKS[l2])

        qalsadi_bugs = {}
        if l2 == "ar":
            for w in KNOWN_QALSADI_BUGS:
                qalsadi_bugs[w] = {
                    "server": next(
                        (d["actual"] for d in server_spot["details"] if d["surface"] == w),
                        None,
                    ),
                    "camel": next(
                        (d["actual"] for d in proto_spot["details"] if d["surface"] == w),
                        None,
                    ),
                }

        result = {
            "l2": l2,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "blocks": len(blocks),
            "maxTokens": args.max_tokens,
            "baseUrl": args.base_url,
            "prototype": {
                "name": prototype.name,
                "loadMs": prototype.load_ms,
                "coldBlockMs": cold_ms,
                "warmBlockMs": warm_ms,
            },
            "server": {
                "engine": "Qalsadi+Mishkal" if l2 == "ar" else "regex fallback (surface-as-lemma)",
                "avgBlockMs": round(statistics.mean(server_ms), 1) if server_ms else None,
                **server_stats,
                "spot": server_spot,
            },
            "prototypeStats": {
                **proto_stats,
                "spot": proto_spot,
            },
            "qalsadiKnownBugs": qalsadi_bugs or None,
        }
        out = PROTO_DIR / f"{l2}.json"
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

        print(f"\n[compare] {l2} — {prototype.name} vs server")
        print(
            f"  reconstruction: server {server_stats['reconstructionPct']}% "
            f"| proto {proto_stats['reconstructionPct']}%"
        )
        print(
            f"  lemma cov:      server {server_stats['lemmaCoverage']:.0%} "
            f"| proto {proto_stats['lemmaCoverage']:.0%}"
        )
        print(
            f"  dict hit:       server {server_stats['dictHitRate']:.0%} "
            f"| proto {proto_stats['dictHitRate']:.0%}"
        )
        print(
            f"  lemma changed:  server {server_stats['lemmaChangedTokens']} "
            f"| proto {proto_stats['lemmaChangedTokens']} (of {proto_stats['tokens']})"
        )
        print(
            f"  spot:           server {server_spot['passed']}/{server_spot['total']} "
            f"| proto {proto_spot['passed']}/{proto_spot['total']}"
        )
        print(
            f"  latency:        server avg {result['server']['avgBlockMs']} ms "
            f"| proto load {prototype.load_ms} ms, cold block {cold_ms} ms, "
            f"warm avg {warm_ms} ms"
        )
        if qalsadi_bugs:
            print(f"  Qalsadi bugs:   {json.dumps(qalsadi_bugs, ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
