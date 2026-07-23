# {$title.explore}

Discover videos in your target language, matched to your level.

## How It Works

The {$title.explore} page shows recommended videos for your language pair. Each video is sourced from {$option.youtube} and selected for language learning — we exclude music and entertainment content (those have their own [{$title.music_and_entertainment}](/docs/media/music) page).

Videos are sorted by popularity and filtered by difficulty when you select a level. The recommendation engine learns from your watch history, so videos you've already watched won't appear again.

## Level Filter

The pills at the top let you filter by proficiency level. The labels adapt to your target language:

| L2 | Pills show |
|---|---|
| {$lang.zh} | {$level.exam_hsk} 1 → {$level.exam_hsk} 7-9 |
| {$lang.ja} | {$level.exam_jlpt} Pre-N5 → N1 |
| {$lang.ko} | {$level.exam_topik} Pre-1 → 6 |
| {$lang.en} | {$level.exam_ielts} 1 → 9 |
| Others | {$level.exam_cefr} Pre-A1 → C2 |

Click a pill to filter videos at that level. Click **{$filter.all}** to see videos at every level. The filter remembers your choice as you browse, and resets to your saved proficiency level when you return.

## Video Cards

Each card shows a color-coded **level badge** in the top-left corner. See [How Difficulty Is Calculated](#how-difficulty-is-calculated) for how these levels are determined.

Click any card to open the video player. When you return to {$title.explore}, your place in the list is preserved exactly where you left it.

### Channel Actions

Each video card has a **…** menu in the top-right corner with two options:

- **{$action.subscribe}** — Videos from this channel will appear first in your recommendations. About 25% of each page is reserved for subscribed channels, so you'll always see their newest content near the top. This is useful for channels you want to follow regularly — news outlets, educational creators, or your favorite vloggers.

- **Not interested** — Videos from this channel will be hidden from your recommendations entirely. This is useful for channels that consistently show up but aren't a good fit — maybe the content is too advanced, too easy, or just not relevant to your learning goals.

Your channel preferences are saved per language, so subscribing to a {$lang.ja} news channel won't affect your {$lang.ko} recommendations. You can manage all your subscriptions and hidden channels from your profile.

## How Difficulty Is Calculated

Every video is assigned a difficulty score based on the frequency of words in its subtitles. The system uses per-language Zipf frequency lists — large tables that rank how common each word is in real-world text. A word like "the" has a high frequency (common), while "sesquipedalian" has a low frequency (rare).

The scores are bucketed into 7 levels using exponential thresholds: the top 1/127 most frequent words are level 1, the next 2/127 are level 2, the next 4/127 are level 3, and so on — doubling each step. Level 7 covers the rarest 64/127 of words.

Because word frequency distributions differ between languages, the thresholds are **language-specific**. A difficulty score of 0.008 in {$lang.ja} maps to {$level.exam_jlpt} N1 (level 6), while the same score in {$lang.ko} maps to {$level.exam_topik} 3 (level 4). The frontend fetches these thresholds once from the backend and uses them to label every video card.

Your channel preferences are saved per language, so subscribing to a {$lang.ja} news channel won't affect your {$lang.ko} recommendations. You can manage all your subscriptions and hidden channels from your profile.

## Tips

- Set your proficiency level on your [profile page](/docs/account/profile) so {$title.explore} starts with the right filter
- Switch levels to find easier or harder content — switching back is instant
- Use [{$title.music_and_entertainment}](/docs/media/music) for music videos and entertainment content
- Your watch history is private and only used to avoid showing the same video twice
