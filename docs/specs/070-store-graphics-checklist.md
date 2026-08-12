# SPEC-070: Prepare Graphics for App Stores

## Metadata

- **Spec ID**: SPEC-070
- **Feature**: Produce all store-listing graphics (icons, feature graphic, screenshots) for both the **Apple App Store** (Language Player GO, iOS) and **Google Play Store** (Language Player 3, Android) from a single shared checklist — so each visual is captured/created once and reused, minimizing repeated work
- **Status**: draft
- **Created**: 2026-08-12
- **See also**: [ADR-0013 — App Store Strategy](../adr/0013-app-store-strategy.md) · [SPEC-048 — Mobile Release Plan](048-mobile-release-plan.md) · [SPEC-067 — Google Play Release Runbook](067-google-play-release-runbook.md)

## Overview

Both stores need store-listing graphics, and most of them show the **same five
screens**: Explore, video player with subtitles, dictionary popup, saved
words / review, and reader. This spec consolidates every graphic requirement
for both stores into **one checklist**, marks each item as App Store, Play
Store, or both, and prescribes a capture-once workflow so the same screenshots
are generated a single time and exported at the sizes each store needs.

The authoritative per-store requirement details remain in SPEC-048 § 3.4
(App Store) and SPEC-067 § 4.4 (Play Store); this spec is the actionable
production checklist that pulls them together.

## Capture-once strategy (minimize repeated work)

1. **Capture the 5 screens once on the iPhone simulator** at the largest
   required 9:16 portrait size (**1320 × 2868**, iPhone 6.9"). Both stores
   accept 9:16 portrait:
   - **App Store** iPhone set: use the 1320 × 2868 captures directly.
   - **Play Store** phone set: downscale the same captures to **1080 × 1920**
     (9:16) — same aspect ratio, no re-capture.
2. **Capture the 5 screens once on the iPad simulator** at **2048 × 2732**
   (12.9", 4:3) → **App Store** iPad set. (Play Store has no 4:3 tablet
   requirement.)
3. **Capture Android tablet set once** at **16:9 landscape 1920 × 1080** →
   reused for both the **7-inch** and **10-inch** Play tablet slots (same
   aspect ratio; Play accepts the same image for both).
4. **App icon**: derive both from the existing 1024 × 1024
   `apps/mobile/assets/icon.png` — Play needs a 512 × 512 export, iOS uses
   the 1024 × 1024 directly.
5. **Feature graphic** (Play only) is the only bespoke asset — create once.

## Master checklist table

Legend — **Store column:** `Both` = required by both stores · `App` = Apple
App Store only · `Play` = Google Play only · *(opt)* = optional.

| # | Asset | Store | Format | Size(s) | Count | Status |
|---|---|---|---|---|---|---|
| 1 | App icon | Both | PNG, sRGB | Play: 512×512 (square, no rounded corners/shadows) · App: 1024×1024 (72 DPI, RGB, no alpha — Apple adds the mask) | 1 | 🟡 Play: exported 512×512 ("Cropped - icon.png") in asset library, **not yet added** to App icon slot (manual: Store listings → edit → App icon → Add assets → select → Add). App: icon present from build |
| 2 | Feature graphic | Play | PNG / JPEG | 1024×500 (≤15 MB) | 1 | ⬜ To produce |
| 3 | iPhone screenshots | App | `.jpeg` / `.jpg` / `.png`, no alpha | 1320×2868 (6.9") — Apple reuses across all iPhone sizes | 1–10 (target 6) | 🟡 6 already uploaded on 6.9" (reused for other iPhone sizes) |
| 4 | iPad screenshots | App | `.jpeg` / `.jpg` / `.png`, no alpha | 2048×2732 (12.9") or 2064×2752 (13") — one size per device family | 1–10 (target 6) | ⬜ **Main gap** — none uploaded |
| 5 | Android phone screenshots | Play | JPEG / 24-bit PNG (no alpha) | 9:16, ≥1080×1920 (downscale of the #3 captures) | 2–8 (target 5–8) | ✅ Produced 2026-08-12 — zh + ja sets @1080×1920 in `apps/mobile/store-assets/screenshots/{zh,ja}/` |
| 6 | 7-inch tablet screenshots | Play | JPEG / 24-bit PNG (no alpha) | 16:9 or 9:16, 320–3840 px | up to 8 (target 4–8) | ⬜ To produce (reuse #7 captures) |
| 7 | 10-inch tablet screenshots | Play | JPEG / 24-bit PNG (no alpha) | 16:9, e.g. 1920×1080 (1080–7680 px) | up to 8 (target 4–8) | ⬜ To produce |
| 8 | App Preview video | App *(opt)* | `.mov` / `.m4v` / `.mp4` (H.264/ProRes 422) | 15–30 s, ≤500 MB, display-size frames | up to 3 | ⬜ Optional — none yet |
| 9 | Preview video (YouTube) | Play *(opt)* | public/unlisted YouTube URL, ads off, not age-restricted | — | 1 | ⬜ Optional — none yet |
| 10 | TV banner + TV screenshots | Play *(only if Android TV)* | 1280×720 banner | — | — | ➖ N/A — no Android TV target |
| 11 | Chromebook screenshots | Play *(only if ChromeOS)* | 16:9 or 9:16, 1080–7680 px | 4–8 | ➖ N/A — no ChromeOS target |
| 12 | Android XR screenshots | Play *(only if XR)* | 8:5, min 1920×1200 (rec. 3840×2400) | 4–8 | ➖ N/A — no XR target |
| 13 | Wear OS screenshots | Play *(only if Wear app)* | 1:1, ≥384×384 | — | ➖ N/A — no Wear target |

**Required items to produce:** #2, #4, #5, #6, #7 (plus the 2-click manual
step on #1). Everything else is optional or N/A.

## The five screens to capture

For each of #3–#7, capture/export the same five screens (in this order):

1. **Explore** — home feed with language pair (L1→L2) and level filter
2. **Video player** — with interactive subtitles and a selected word
3. **Dictionary popup** — word entry with definition + examples
4. **Saved words / review** — vocabulary list or SRS review session
5. **Reader** — EPUB reader (if applicable to the target audience)

## Content rules (both stores)

- Show **real in-app UI only** — no device frames, hands, or people.
- **No store badges / platform logos** (no Google Play or Apple icons), no
  ranking/award claims ("Best", "#1", "Top"), no calls-to-action ("Download
  now").
- Taglines/overlays ≤ ~20% of the image (Play).
- **No transparency / alpha channel** in any screenshot.
- Play screenshots need **alt text** (≤140 chars) per screenshot at upload.

## To produce — concrete deliverable list

1. **Feature graphic** — 1024×500 PNG (#2)
2. **iPhone screenshot set** — 6 @ 1320×2868: the five screens above (#3)
3. **iPad screenshot set** — 6 @ 2048×2732: the five screens above (#4)
4. **Android phone screenshot set** — 5–8 @ 1080×1920: downscale of #3 (#5)
5. **Android tablet screenshot set** — 4–8 @ 1920×1080 landscape: 7" + 10" (#6, #7)
6. *(Optional)* App Preview video and/or Play YouTube preview (#8, #9)

## Status

- 2026-08-12: Android phone screenshot sets produced (Chinese + Japanese) at
  1080×1920, saved under `apps/mobile/store-assets/screenshots/{zh,ja}/`.
- 2026-08-12: Spec created. iPhone 6.9" screenshots (#3) already uploaded to
  App Store Connect (from an earlier pass); Play icon exported to the asset
  library but not yet added to the App icon slot (#1). All other graphics
  outstanding.

## Dependencies

- [SPEC-048 — Mobile Release Plan](048-mobile-release-plan.md) — App Store
  asset requirements (§ 3.4)
- [SPEC-067 — Google Play Release Runbook](067-google-play-release-runbook.md)
  — Play Store asset requirements (§ 4.4)
- `apps/mobile/assets/icon.png` — source of the app icons (#1)
