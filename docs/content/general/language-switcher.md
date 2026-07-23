# Language Switcher

{$title.app_name} works with a language pair — the language you speak and the language you're learning. Everything in the app is built around this pair: the interface appears in your language, videos and dictionary entries are in your learning language, and translations go between the two.

You pick your pair when you first sign up, and you can change it any time from the header.

## Your Language Pair

{$title.app_name} uses two languages at all times:

- **L1** — Your native language. This is what the interface, menus, and buttons appear in. It's also the language translations go into.
- **L2** — The language you're learning. Videos, subtitles, and dictionary results are all in this language.

For example, if you speak {$lang.en} and you're learning {$lang.ja}, your pair is {$lang.en} → {$lang.ja}. The interface is in {$lang.en}, videos play in {$lang.ja}, and translations go from {$lang.ja} to {$lang.en}.

## First Visit — Onboarding

The first time you open {$title.app_name}, you'll see the language picker. It has two columns side by side:

- **Left column** — **{$title.i_speak}**. Pick the language you're most comfortable with. This becomes your L1.
- **Right column** — **{$title.i_learning}**. Pick the language you want to learn. This becomes your L2.

Each column has a search bar at the top. Start typing to find your language, or scroll through the list. Popular languages are shown first, followed by all available languages in alphabetical order.

Click a language to select it. Your choice is highlighted — blue for L1, orange for L2. Once you've picked both, a **{$action.continue}** button appears at the bottom. Click it to start using {$title.app_name} with your chosen pair.

### Chinese Script Choice

If you pick {$lang.zh} as your L2, a script toggle appears between the two columns after you select it. Choose between:

- **{$setting.simplified}** — Characters used in mainland China and Singapore
- **{$setting.traditional}** — Characters used in Taiwan, Hong Kong, and Macau

You can change this preference later in [{$title.settings}](/docs/general/settings), under the **{$label.character_set}** option in the {$setting.display} tab.

## Changing Languages — The Header Switcher

Once you're past onboarding, your current language pair is shown in the header at the top of every page. It looks like two language labels with a swap button between them.

Click either language label to open a dropdown. The dropdown has a search bar and a scrollable list — same Popular and All Languages sections as the onboarding page. Click a new language to switch. The page reloads with your new pair, and everything updates: the interface language, the videos shown, the dictionary, and your saved words.

### Swapping Languages

Between the two language labels there's a swap button (two arrows, ↔). Click it to flip your pair — your L1 becomes your L2, and your L2 becomes your L1. This only works if your L2 is also available as an interface language (one of the 31 supported UI languages). If it isn't, the button has no effect.

Swapping is useful when you want to see the app from the other perspective — for example, if you're a {$lang.ja} speaker learning {$lang.en}, swap to see the interface in {$lang.ja} and dictionary entries in {$lang.en}.

## What Changes When You Switch

Changing your language pair affects almost everything in the app:

| What changes | Details |
|---|---|
| **Interface language** | All menus, buttons, and labels switch to your new L1 |
| **Videos** | {$title.explore}, {$title.tv_shows}, and {$title.live_tv} show content in your new L2 |
| **Dictionary** | The dictionary switches to your new L2 ↔ L1 pair. Definitions appear in your new L1 |
| **Saved words** | Vocabulary lists are per-language. Switching to a different L2 shows that language's saved words |
| **{$title.settings}** | Per-language settings (like phonetics and voice) change to match your new L2 |
| **Search** | Video search and dictionary search target your new L2 |

Your watch history, saved words, and settings are all saved per language — nothing is lost when you switch.

## Searching for Languages

Both the onboarding picker and the header dropdown have a search bar. Type to filter the language list instantly. The search matches against:

- The language's name in its own script (e.g., 日本語, Español)
- The localized name in your current interface language
- The English name
- The ISO language code (e.g., `ja`, `es`, `zh`)

Clear the search to see the full list again with Popular languages at the top.

## Tips

- Pick your **actual strongest language** as L1, not the one you're "supposed" to speak. Accurate translations depend on it.
- Use the swap button to check how the app looks in your L2 — it's a quick way to test your reading comprehension.
- If you're learning multiple languages, switch between them from the header. Your progress for each is kept separate.
- The script toggle for {$lang.zh} remembers your choice, so you only need to set it once.
- Your last-used language pair is saved in your browser. Next time you visit, you'll go straight to your content — no need to pick again.