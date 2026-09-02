# TTS Voice Selection — Cross-Platform Quality Ranking

## Metadata
- **Arch ID**: ARCH-031
- **Feature**: Voice auto-selection for text-to-speech (Settings → Speech "Auto", word pronunciation, sentence playback)
- **Type**: as-built
- **Status**: accepted
- **Created**: 2026-09-02
- **Scope**: Shared (`packages/shared/src/voice-selection.ts`), Web (`apps/web/src/hooks/use-speech.ts`), Mobile (`apps/mobile/hooks/use-speech.ts`)
- **See also**:
  - ARCH-011 — settings architecture (per-L2 `speech: { voiceURI, rate }` storage)
  - ARCH-027 — per-aspect logging (`speech` domain)
  - SPEC-015 / SPEC-017 — Settings → Speech screens

---

## Overview

Every TTS call in the app resolves a concrete voice: the user's saved
per-L2 `voiceURI` when set, otherwise a quality-ranked auto-pick. Before
ARCH-031 the web auto-pick was a first-match heuristic (exact BCP 47 tag →
language prefix → `voices[0]`) that frequently landed on low-quality
voices, and mobile had **no** voice auto-selection at all — it passed only
a language code and let the OS pick its default (lowest-tier) voice.

This doc records the platform research the ranking is derived from, and
the shipped algorithm.

## Platform voice-quality research

### Apple — macOS & iOS (AVFoundation)

`AVSpeechSynthesisVoice.quality` returns `AVSpeechSynthesisVoiceQuality`:
`default` (rawValue 1) < `enhanced` (2) < `premium` (3) —
[Apple docs](https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoicequality).
Enhanced/premium voices must be downloaded by the user.

Verified on a real machine (`AVSpeechSynthesisVoice.speechVoices()`,
183 voices): the tier is visible in three places —

1. expo-speech's `quality` field (`'Default' | 'Enhanced'`), **but** the
   iOS mapping is `quality == .enhanced ? "Enhanced" : "Default"` — a
   **premium** voice is mislabeled `'Default'`.
2. The voice identifier: `com.apple.voice.premium.zh-CN.Yue`,
   `com.apple.voice.enhanced.ja-JP.Otoya`, `com.apple.voice.compact.…`,
   `com.apple.eloquence.…` (robotic pack), `com.apple.speech.synthesis.voice.…`
   (legacy MacinTalk novelty).
3. The display name: "Yue (Premium)", "Otoya (Enhanced)".

⇒ All three sources must be parsed; identifier/name parsing repairs the
expo mislabeling and covers browsers, which never expose the `quality`
field.

macOS also ships a large set of novelty/Eloquence voices (Zarvox, Bubbles,
Bells, Eddy, Flo, Grandma, Grandpa, Reed, Rocko, Sandy, Shelley, …) that
are unusable for language learning — the readium project's
[WebSpeech notes](https://github.com/readium/speech/blob/main/docs/WebSpeech.md)
call them out as "a large range of low quality and weird voices".
The auto-picker demotes them (`NOVELTY` tier) rather than excluding them,
because on some machines a novelty voice is the *only* installed voice for
a language.

### Android

`android.speech.tts.Voice.getQuality()` returns 100..500 —
`QUALITY_VERY_LOW(100)`, `QUALITY_LOW(200)`, `QUALITY_NORMAL(300)`,
`QUALITY_HIGH(400)`, `QUALITY_VERY_HIGH(500)`, "higher is better"
([AOSP Voice.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/speech/tts/Voice.java)).
Google's engine voices also carry `-local` / `-network` suffixes in their
names; network variants are generally higher quality but need connectivity.

expo-speech maps the numeric quality to `'Enhanced'` (`> QUALITY_NORMAL`)
or `'Default'` and normalizes the locale to `lang-REGION` via
`LanguageUtils.getISOCode` — **note** Mandarin voices surface as
`cmn-CN` (ISO 639-3), handled by the tag-family matching below. Latency
and `isNetworkConnectionRequired` are NOT exposed by expo-speech, so the
binary quality field is the strongest available signal.

### Windows & browsers (web app runs in browsers on every desktop OS)

The Web Speech API `SpeechSynthesisVoice` exposes only `name`, `lang`,
`voiceURI`, `localService`, `default` — **no quality field** (MDN).
Naming conventions carry the signal:

| Voice name pattern | Platform | Tier |
|---|---|---|
| `Microsoft … Online (Natural) - …` | Edge (250+ ML voices, network-only) | PREMIUM |
| `… (Premium)` | Apple voices surfaced in Chrome on macOS | PREMIUM |
| `… (Enhanced)` | Apple enhanced voices in Chrome on macOS | ENHANCED |
| `Google …` (e.g. `Google 日本語`) | Chrome network voices | DEFAULT* |
| everything else | local compact/SAPI voices | DEFAULT |
| `Zarvox`, `Bubbles`, `Eddy`, `Flo`, … (novelty/Eloquence) | macOS | NOVELTY |

\* Chrome's network voices sound better than local compact voices despite
having no quality marker, so they get the plain `DEFAULT` tier; within the
tier, the offline (`localService`) bonus prefers Apple's local voices —
this intentionally keeps reliability ahead of a marginal quality gain
(readium notes Chrome network voices also have a >14 s utterance bug and
no boundary events).

`default: true` is unreliable (Safari returns it for *all* voices; Chrome
on Android omits it) — it carries a minor weight only. On Chrome for
Android, `lang` uses underscores (`en_us`); tags are normalized before
comparison. Firefox on Android uses 3-letter codes (`eng-US-f000`), which
are NOT matched — a documented gap.

## The shipped algorithm (`packages/shared/src/voice-selection.ts`)

Both apps map their platform voices into one shape:

```ts
interface VoiceCandidate {
  identifier: string;   // voiceURI (web) / identifier (expo-speech)
  name: string;
  lang: string;         // e.g. "ja-JP"; "en_us" accepted, normalized
  quality?: string;     // expo-speech 'Default' | 'Enhanced'; absent on web
  localService?: boolean;
  isDefault?: boolean;
}
```

1. **Language gate** — a candidate must match the L2. Matching compares the
   voice's primary subtag against the L2 code's primary subtag **and** the
   primary subtag of the L2's canonical speech tag
   (`LANG_TO_SPEECH_TAG`: zh→zh-CN, yue→zh-HK, nan→zh-TW, en→en-US, …).
   The tag-family match is what lets yue/nan find `zh-*` voices (the old
   prefix-only match never did).
2. **Score** =
   `tier × 1000 + exactCanonicalTag × 100 + localService × 10 + isDefault × 5`
   where tier is `PREMIUM(3) / ENHANCED(2) / DEFAULT(1) / NOVELTY(0)`,
   derived from (in order): the `quality` field → Apple identifier →
   name conventions → fallback `DEFAULT`. Quality dominates locale: a
   higher-tier voice of a different region beats a lower-tier voice of the
   canonical region — pronunciation quality is the product goal; region
   only breaks ties. `NOVELTY` never beats `DEFAULT`, so compact voices
   always win over novelty voices of the same language.
3. **Pick** —
   1. the user's saved `voiceURI`/identifier, when it still exists
      (explicit choice always wins; a stale id — uninstalled voice or one
      synced from another device — silently falls through to auto-pick
      instead of being passed to the OS, which throws on iOS);
   2. otherwise the top-ranked candidate;
   3. otherwise `null` → **the app does not speak** and logs a warning.
      Reading Japanese text with an English voice is gibberish; silence is
      the correct fallback. `rankVoicesForL2` exposes the same ranking
      (best first, duplicates deduped — iOS lists some preloaded voices
      twice) for dropdown ordering.

## Integration

| App | File | Change |
|---|---|---|
| Web | `apps/web/src/hooks/use-speech.ts` | `pickBestVoice` over candidates mapped from `speechSynthesis.getVoices()`; no-match → logwarn, no utterance |
| Web | `apps/web/src/components/voice-picker.tsx` | L2-only list, no group header, no speaker icons, right-aligned locale tag |
| Mobile | `apps/mobile/hooks/use-speech.ts` | enumerates `getAvailableVoicesAsync()` once per session, auto-picks best voice (previously passed language only — OS default voice = lowest tier) |
| Mobile | `apps/mobile/components/VoicePicker.tsx` | native `MenuView` kept (per decision 2026-09-02: items are plain strings, no per-item layout); "other voices" fallback removed; Auto always present |

## Diagnostics

Per-aspect `speech` log domain on both apps (ARCH-027):

```
[LP Web] [speech] l2=ja → "Otoya (Enhanced)" (ja-JP) local=true | 12 candidates, chosen score-ranked (ARCH-031)
[LP Web] [speech] no match for l2=ja — available langs: ["en-US", …]
```

Enable with `NEXT_PUBLIC_LOG_LEVEL_SPEECH=3` / `EXPO_PUBLIC_LOG_LEVEL_SPEECH=3`
(web dev defaults the global level to 2, so the domain var is needed) or at
runtime via `setLogLevel(3, 'speech')`.

## Known gaps

- Firefox on Android's 3-letter lang tags (`eng-US-f000`) never match —
  rare browser, accepted gap.
- macOS localizes voice display names on non-English systems, so name-based
  novelty detection can miss localized novelty names; the Apple identifier
  check covers them where identifiers are visible.
- Chrome desktop exposes only ~19 Google network voices plus local system
  voices; Safari hides downloaded enhanced/premium voices entirely —
  nothing the picker can do about platform-invisible voices.

## Testing

`packages/shared/src/voice-selection.test.ts` — 21 unit cases with
real-world fixtures (macOS `speechVoices()` dump, Edge "Online (Natural)"
naming, Android Google-TTS `cmn-cn-x-…` ids), covering tier parsing, the
expo premium mislabel repair, tag-family matching, tie-breaks, dedupe,
stale-preferred fallback, and no-match → null.
