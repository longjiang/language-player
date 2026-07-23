// Auto-generated from docs/content/ — DO NOT EDIT
export type DocEntry = { path: string; title: string; category: string; content: string };

export const DOCS: DocEntry[] = [
  { path: 'account/login.md', title: 'Login.md', category: 'account', content: `# Logging In

Sign in to your account, reset a forgotten password, and sign out when you're done.

## How to Log In

1. Go to the **[login page](/login)** by clicking the user icon in the top-right corner and selecting **Log In**
2. Enter your **Email** and **Password**
3. Click **Log In**

If your credentials are correct, you'll be redirected to the language selection page (or back to the page you were on before logging in).

If you enter the wrong email or password, an error message appears — double-check both fields and try again.

## Don't Have an Account?

Click **Sign up** below the login form to create a new account. See [Registration](/docs/account/registration) for the full sign-up walkthrough.

## Forgot Your Password?

If you can't remember your password:

1. On the login page, click **Forgot password?**
2. Enter your email address and click **Send Reset Link**
3. Check your inbox for a password reset email
4. Follow the link in the email to set a new password

For security, the page always shows a success message after you submit — even if the email isn't registered. This prevents anyone from checking whether a particular email has an account.

> **Note:** The password reset link comes from Directus, our identity provider. If you don't see the email within a few minutes, check your spam folder.

## How to Log Out

Click the user icon in the top-right corner (it shows your initial), then click **Log Out** at the bottom of the menu. You'll be signed out and redirected to the home page.

Logging out clears your local session, but your saved words, watch history, and settings are preserved — they'll be restored next time you sign in.

## Switching Accounts

To switch to a different account, log out first, then log in with the other email address. There's no account switcher — each browser session uses one account at a time.

## Tips

- Your login session persists across browser restarts — you won't need to log in every time you visit
- If you're on a shared device, always log out when you're done
- The forgot password flow works even if you registered with the same email — it sends a reset link regardless
- You can manage your account details from your **[Profile](/docs/account/profile)**
` },
  { path: 'account/profile.md', title: 'Profile.md', category: 'account', content: `# Profile

Your profile page shows account info, language level, subscription status, watch history, and saved words — all in one place.

## Account Info

At the top of the page you'll see your display name and email address. This is the information tied to your account — it's what you used when you signed up.

## Language Level

The **Settings** section lets you set your proficiency level for the current target language. Choose from the dropdown to match your ability:

- **Chinese** shows HSK levels (1 through 7-9)
- **Japanese** shows JLPT levels (Pre-N5 through N1)
- **Korean** shows TOPIK levels (Pre-1 through 6)
- **English** shows IELTS levels (1 through 9)
- **All other languages** show CEFR levels (Pre-A1 through C2)

Your level is used to filter video recommendations on the [Explore](/docs/media/explore) page and to color-code difficulty badges on video cards. You can change it anytime — your recommendations update immediately.

## Subscription

The **Subscription** section shows your current plan and lets you manage it.

### Free Account

If you're on a free account, you'll see a **Free Account** badge and three plan cards — Monthly ($10/mo), Annual ($90/yr), and Lifetime ($169). Click **Upgrade to Pro** to go to the [Go Pro](/docs/account/subscription) page and choose a plan.

### Active Pro Subscription

If you have an active subscription, you'll see:

- A **Monthly**, **Annual**, or **Lifetime** badge
- Days remaining until renewal (monthly and annual plans)
- An **Auto-renews** badge if auto-renewal is on
- The payment method used (Stripe, PayPal, or Apple App Store)

From here you can:

- **Cancel Auto-Renewal** — stops auto-renewal at the end of your current billing period. Your Pro access stays active until then.
- **Upgrade** — switch from Monthly to Annual, or from any plan to Lifetime
- **Upgrade to Lifetime** — a one-time $169 payment for permanent Pro access

### Expired Subscription

If your subscription has ended, you'll see a red expired badge and a **Renew** button. All your saved words, watch history, and settings are preserved — just renew to pick up where you left off.

## Watch History

The **Watch History** section shows the last 5 videos you watched, with thumbnails and durations. Click any video to resume playback from where you left off, with your full watch history loaded as a queue.

Click **See All** to open the full [Watch History](/docs/media/watch-history) page, where you can browse, search, and replay every video you've watched in this language.

## Saved Words

The **Saved Words** section shows your 10 most recently saved words for the current target language. Each entry shows the word and the video it came from — click a word to open its dictionary entry, or click **See All** to browse your full vocabulary on the [Saved Words](/docs/vocab/saved-words) page.

## Tips

- Your language level is per-language — setting your Chinese level to HSK 3 won't affect your Japanese level
- The Watch History and Saved Words sections only show content for the current target language — switch L2 in the header to see other languages
- 14-day money-back guarantee. Questions? [Contact us](mailto:jon.long@zerotohero.ca)
- Cancelling auto-renewal keeps your Pro features active until the end of your billing period — nothing is interrupted early
` },
  { path: 'account/registration.md', title: 'Registration.md', category: 'account', content: `# Create your account

Create your Language Player account in two steps — fill in your details, then verify your email.

## How Registration Works

Registration has three steps:

1. **Fill in the form** — enter your name, email, and a password
2. **Verify your email** — enter the 6-digit code we send you
3. **Done** — you're signed in and redirected to language selection

## Step 1: Create Your Account

Go to the **[registration page](/register)** by clicking **Sign up** on the [login page](/docs/account/login).

Fill in the form:

- **First** and **Last** — your name as you'd like it to appear on your profile
- **Email** — the email you'll use to sign in and receive password resets
- **Password** — Min. 8 characters

Click **Create Account** to submit. If the email is already registered, you'll see an error — use the [forgot password](/docs/account/login#forgot-your-password) flow instead.

## Step 2: Verify Your Email

After submitting the form, we send a 6-digit verification code to your email. The page changes to a code entry screen:

- Enter the code in the **Verification code** field — it accepts digits only
- Click **Verify Email** to confirm

If the code is incorrect, you'll see an error — double-check the email and try again.

Didn't get the code? Click **Resend** to send a new one. If it still doesn't arrive, check your spam folder.

## Step 3: You're In

Once your email is verified, you're automatically signed in and redirected to the language selection page. From there, pick your native language and the language you want to learn — you're ready to start watching videos.

## Already Have an Account?

If you already registered, click **Log In** at the bottom of the registration form to go to the [login page](/docs/account/login) instead.

## Tips

- Use a real email address — you'll need it for password resets and account recovery
- The verification code expires after a short time — if it does, click **Resend** to get a fresh one
- Passwords must be at least 8 characters — longer is better for security
- After registering, set your language level on your **[Profile](/docs/account/profile)** to get level-matched video recommendations
` },
  { path: 'account/subscription.md', title: 'Subscription.md', category: 'account', content: `# Subscription

Choose a plan, manage your subscription, and understand what you get with Pro.

## Free vs Pro

Language Player is free to use, with an optional Pro upgrade that unlocks the full experience.

| Feature | Free | Pro |
|---|---|---|
| 600,000+ videos in 207+ languages | ✅ | ✅ |
| Dictionary with collocations, examples, and verb inflections | ✅ | ✅ |
| Chinese character decomposition | ✅ | ✅ |
| Interactive transcripts with translation | First 10 lines | Full transcript |
| Word examples in videos | 2 per word | Hundreds per word |
| AI-powered word explanations | — | ✅ |
| Priority support | — | ✅ |

## Plans

| Plan | Price | Billing |
|---|---|---|
| **Monthly** | US$10/mo | Billed each month. Cancel anytime. |
| **Annual** | US$90/yr | Billed annually. Save 25% vs monthly. |
| **Lifetime** | US$169 | Never Expires. Pay once, access forever. |

All plans include a 14-day money-back guarantee. Questions?

## How to Upgrade

1. Open your **[Profile](/docs/account/profile)** from the top-right menu
2. Scroll to the **Subscription** section
3. Click **Upgrade to Pro** (or **Upgrade** if you're already on a Pro plan)
4. Choose a plan — Monthly, Annual, or Lifetime
5. Pick a payment method and complete checkout

After payment, you'll be redirected to a confirmation page. Your Pro features are active immediately — no need to log out or refresh.

## Payment Methods

| Method | Available for | Currency |
|---|---|---|
| Credit Card | All plans | USD |
| WeChat Pay | All plans | CNY |
| Alipay | All plans | CNY |
| PayPal is also available for lifetime purchases. | Lifetime only | USD |

Credit card payments are processed securely through Stripe. Your card details are never stored on our servers.

## Managing Your Subscription

### Check Your Status

Your current plan, billing cycle, and renewal date are shown on your **[Profile](/docs/account/profile)** page under the Subscription section.

### Cancel Auto-Renewal

Monthly and Annual plans renew automatically. To stop auto-renewal:

1. Go to your **[Profile](/docs/account/profile)**
2. In the Subscription section, click **Cancel Auto-Renewal**
3. Confirm by clicking **Confirm Cancellation**

Your Pro access continues until the end of your current billing period. After that, your account returns to Free and you'll keep all your saved words, watch history, and settings.

### Renew an Expired Subscription

If your Pro subscription expired, click **Renew** on your profile page to subscribe again. All your data is preserved — nothing is lost when a subscription lapses.

### Upgrade Your Plan

You can upgrade from Monthly to Annual or Lifetime at any time:

1. Go to your **[Profile](/docs/account/profile)**
2. Click **Upgrade** in the Subscription section
3. Choose your new plan and complete payment

When you upgrade, the remaining value of your current plan is credited toward the new one. Your new billing cycle starts immediately.

## Tips

- The Go Pro page shows real-time prices — no hidden fees or taxes added at checkout
- Lifetime is a one-time payment with no recurring charges — 1. Assuming you will live longer than 2.4 years.
- Cancelling auto-renewal doesn't delete anything — you keep full Pro access until the period ends
- If you run into payment issues, contact [Email Support](mailto:jon.long@zerotohero.ca) and we'll help within 24 hours
` },
  { path: 'general/language-switcher.md', title: 'Language Switcher.md', category: 'general', content: `# Language Switcher

Language Player works with a language pair — the language you speak and the language you're learning. Everything in the app is built around this pair: the interface appears in your language, videos and dictionary entries are in your learning language, and translations go between the two.

You pick your pair when you first sign up, and you can change it any time from the header.

## Your Language Pair

Language Player uses two languages at all times:

- **L1** — Your native language. This is what the interface, menus, and buttons appear in. It's also the language translations go into.
- **L2** — The language you're learning. Videos, subtitles, and dictionary results are all in this language.

For example, if you speak English and you're learning Japanese, your pair is English → Japanese. The interface is in English, videos play in Japanese, and translations go from Japanese to English.

## First Visit — Onboarding

The first time you open Language Player, you'll see the language picker. It has two columns side by side:

- **Left column** — **I speak**. Pick the language you're most comfortable with. This becomes your L1.
- **Right column** — **I'm learning**. Pick the language you want to learn. This becomes your L2.

Each column has a search bar at the top. Start typing to find your language, or scroll through the list. Popular languages are shown first, followed by all available languages in alphabetical order.

Click a language to select it. Your choice is highlighted — blue for L1, orange for L2. Once you've picked both, a **Continue** button appears at the bottom. Click it to start using Language Player with your chosen pair.

### Chinese Script Choice

If you pick Chinese as your L2, a script toggle appears between the two columns after you select it. Choose between:

- **简体 Simplified** — Characters used in mainland China and Singapore
- **繁體 Traditional** — Characters used in Taiwan, Hong Kong, and Macau

You can change this preference later in [Settings](/docs/general/settings), under the **Character set** option in the Display tab.

## Changing Languages — The Header Switcher

Once you're past onboarding, your current language pair is shown in the header at the top of every page. It looks like two language labels with a swap button between them.

Click either language label to open a dropdown. The dropdown has a search bar and a scrollable list — same Popular and All Languages sections as the onboarding page. Click a new language to switch. The page reloads with your new pair, and everything updates: the interface language, the videos shown, the dictionary, and your saved words.

### Swapping Languages

Between the two language labels there's a swap button (two arrows, ↔). Click it to flip your pair — your L1 becomes your L2, and your L2 becomes your L1. This only works if your L2 is also available as an interface language (one of the 31 supported UI languages). If it isn't, the button has no effect.

Swapping is useful when you want to see the app from the other perspective — for example, if you're a Japanese speaker learning English, swap to see the interface in Japanese and dictionary entries in English.

## What Changes When You Switch

Changing your language pair affects almost everything in the app:

| What changes | Details |
|---|---|
| **Interface language** | All menus, buttons, and labels switch to your new L1 |
| **Videos** | Explore, TV Shows, and Live TV show content in your new L2 |
| **Dictionary** | The dictionary switches to your new L2 ↔ L1 pair. Definitions appear in your new L1 |
| **Saved words** | Vocabulary lists are per-language. Switching to a different L2 shows that language's saved words |
| **Settings** | Per-language settings (like phonetics and voice) change to match your new L2 |
| **Search** | Video search and dictionary search target your new L2 |

Your watch history, saved words, and settings are all saved per language — nothing is lost when you switch.

## Searching for Languages

Both the onboarding picker and the header dropdown have a search bar. Type to filter the language list instantly. The search matches against:

- The language's name in its own script (e.g., 日本語, Español)
- The localized name in your current interface language
- The English name
- The ISO language code (e.g., \\`ja\\`, \\`es\\`, \\`zh\\`)

Clear the search to see the full list again with Popular languages at the top.

## Tips

- Pick your **actual strongest language** as L1, not the one you're "supposed" to speak. Accurate translations depend on it.
- Use the swap button to check how the app looks in your L2 — it's a quick way to test your reading comprehension.
- If you're learning multiple languages, switch between them from the header. Your progress for each is kept separate.
- The script toggle for Chinese remembers your choice, so you only need to set it once.
- Your last-used language pair is saved in your browser. Next time you visit, you'll go straight to your content — no need to pick again.` },
  { path: 'general/settings.md', title: 'Settings.md', category: 'general', content: `# Settings

Settings controls how Language Player looks and behaves while you're learning. Open it from your profile menu. Settings are organized into four tabs — Display, Playback, Speech, and Review.

Your settings save automatically. They sync across devices when you're signed in.

## Display

Everything that affects how text and subtitles look on screen.

### Theme

Pick Light, Dark, or System. System follows your device's appearance setting and switches automatically.

### Translation

Show Translation adds a line in your language below each subtitle. Turn it off for immersion, on for comprehension. You can also toggle this from the video player with the Translation pill button.

### Popup Dictionary

When enabled, tap any word to see its definition, pronunciation, and example sentences. The popup also lets you save words to your [vocabulary list](/docs/vocab/saved-words). When disabled, tapping a word does nothing.

A live preview below the toggle shows how your text will look — you can adjust font, size, and phonetics and see the result immediately.

### Text Appearance

**Font** — Default uses your browser's standard font. Serif adds small decorative strokes to characters. Sans-serif uses clean, modern letterforms.

**Text Size** — A slider from smallest to largest. Changes font size everywhere in the app — subtitles, transcripts, and [dictionary](/docs/vocab/dictionary) entries.

### Phonetics

Phonetics are pronunciation guides that appear with the text. For Chinese, this is Pinyin above characters. For Japanese, it's Furigana. For other languages, it's a romanized reading.

**Show Phonetics** has three options:
- **On top of word** — the pronunciation sits above each word
- **Replacing word** — the pronunciation replaces the original script entirely
- **Off** — no phonetics at all

When "On top of word" is selected, a second control appears: **Show For**. Choose **All Words** to annotate everything, or **Hard Words Only** to only show phonetics on words above your proficiency level. You can set your proficiency level on your [profile page](/profile).

### Word-Level Display

**Show Quick Gloss** shows a short translation above words you've saved to your vocabulary list. It's a quick reminder of what the word means without opening the full dictionary.

**Show Interlinear Gloss** shows the first dictionary definition below every word in the text. Unlike Show Quick Gloss (saved words only), this applies to all words.

**Character set** is for Chinese learners — choose between Simplified and Traditional characters. For Korean, there's a **Show Hanja** toggle that displays Chinese characters alongside Hangul. For Vietnamese, **Show Hán Tự** adds the original Chinese-based characters.

### Interaction

**Quiz Mode** hides saved words in the text and replaces them with blanks. Tap a blank to reveal the word. It's a self-testing tool — see if you can recall a word by reading the surrounding sentence, then tap to check.

## Playback

Settings for how videos play and how subtitles behave.

### Captions

**Transcript Mode** shows the full interactive transcript of a video as a scrollable page, instead of syncing one subtitle line at a time to the video. Use it to read ahead, jump to specific lines, or study the entire dialogue at once.

**Smooth Scroll** keeps the active subtitle line centered in the transcript panel as the video plays. The transcript scrolls gently to follow along.

**Karaoke Mode** highlights each word in the current subtitle as it's spoken. The highlight moves word by word, matching the audio.

### Auto-Pause

Pauses the video after each subtitle line finishes. Useful when you want time to read, look up words, and process what you heard before moving on.

### Collapse Video

Collapses the video player to a compact mini-player when you scroll through the transcript. Gives you more room to read while keeping the video visible.

## Speech

Choose the text-to-speech voice used when you play word pronunciations. You can pick a voice for your target language, adjust the speech rate, and test it before saving. See [Pronunciation Voice](/docs/vocab/dictionary#pronunciation) for more on how pronunciation works in the dictionary.

## Review

Settings for your spaced repetition practice.

**New cards per day** sets the maximum number of new vocabulary cards introduced each day. Lower numbers mean fewer new words but more manageable daily sessions. Higher numbers ramp you up faster but increase your daily workload. The default is 20.

See [Saved Words & Review](/docs/vocab/saved-words) for how the review system works.

## Tips

- Toggle Translation on and off from the video player itself — no need to open Settings every time
- If you find yourself looking up every word, try **Hard Words Only** for phonetics to reduce visual clutter
- Quiz Mode is most effective with shorter texts — start with a paragraph, not a full article
- Your per-language settings (phonetics, character set, voice) travel with you when you switch between language pairs
` },
  { path: 'getting-started.md', title: 'Getting Started.md', category: 'getting-started', content: `# Getting Started

Welcome to Language Player — learn any language by watching real videos with interactive subtitles. Click any word to see its definition, save it to your vocabulary, and let the app schedule reviews so you never forget.

This guide walks you through everything from creating an account to watching your first video.

## Create a Free Account

You can browse Language Player without an account, but signing up lets you save words, track your watch history, and sync your progress across devices.

1. Click **Sign up** in the top-right corner
2. Enter your email and a password
3. Check your inbox for a verification code — enter it to confirm your email
4. You're in! Your account is free and stays free

A Free Account gives you access to 600,000+ videos across 207+ languages, the full dictionary, and spaced repetition review. See [Subscription](/docs/account/subscription) for what's included and how to upgrade if you want more.

## Choose Your Languages

Language Player works with a **language pair** — your native language (L1) and the language you're learning (L2). Pick both to get started.

### First Time

When you sign up, you'll see the language selection page with two columns:

- **Left column** — Choose your languages to get started (your native language). This sets the app's interface language.
- **Right column** — your target language (the one you want to learn).

Type to search. You can search by the language's **native name**, its **English name**, or its **ISO code**. For example, to find Japanese, you can type \\`日本語\\`, \\`Japanese\\`, or \\`ja\\`.

If you're learning Chinese, a toggle appears below the search bar to switch between Simplified and Traditional characters.

Click a language in each column, then click **Start Learning** at the bottom. Your choices are saved in the URL and remembered across sessions.

### Switching Later

You can change either language at any time from the header. Click the language name in the top bar to open a dropdown, or use the **swap button** between the two language labels to flip your pair (L1 ↔ L2). See [[?title.language_switcher]](/docs/general/language-switcher) for all the ways to switch.

## Watch Your First Video

The fastest way to get started:

1. Go to **Explore** from the sidebar or navigation menu
2. You'll see a grid of video cards — each one has a thumbnail, a difficulty badge (like CEFR A1 or HSK 3), and a view count
3. Use the **level filter pills** at the top to find videos at your proficiency level
4. Click any video to open the [Reading](/docs/media/video-player)

The video player shows interactive subtitles beside the video. Every word is clickable — tap a word to see its definition, pronunciation, and a bookmark button to save it to your vocabulary list. Translations appear below each subtitle line in your native language.

See [Explore](/docs/media/explore) for details on filtering, channel subscriptions, and difficulty scoring.

## What You Can Do

Language Player has more than just videos. Here's what's available:

| Feature | What it does | Where |
|---|---|---|
| **Interactive video player** | Watch with dual subtitles and clickable words | [Explore](/docs/media/explore) → click any video |
| **Dictionary** | Look up any word, see conjugations, get AI explanations | **Vocab** → [Dictionary](/docs/vocab/dictionary) |
| **Saved Words** | Build your personal vocabulary list | Click the bookmark icon on any word |
| **Review** | Spaced repetition flashcards for your saved words | **Vocab** → [Review](/docs/vocab/review) |
| **Reader** | Paste or write text, read with interactive word lookup | **Reading** → [Reader](/docs/reading/reader) |
| **TV Shows** | Browse TV series with full episode queues | **Notes** → [TV Shows](/docs/media/tv-shows) |
| **Live TV** | Stream live broadcasts in your target language | [Live TV](/docs/media/live-tv) |
| **Music & Entertainment** | Music videos and entertainment content | [Music & Entertainment](/docs/media/music) |
| **Search** | Find videos by title or paste any YouTube URL | [Search](/docs/media/search) |

## Build Your Vocabulary

As you watch, click unfamiliar words and click the bookmark icon to save them. Over time, you'll build a personal vocabulary list organized by the date you saved each word.

Your saved words feed into the [Review](/docs/vocab/review) system — the app schedules flashcards so you review each word just before you'd forget it. Each card shows the original sentence where you found the word, so you're always learning in context.

See [Popup Dictionary](/docs/vocab/popup-dictionary) for how word lookup works, and [Saved Words](/docs/vocab/saved-words) for managing your vocabulary list.

## Free vs Pro

Language Player is free to use. The Pro upgrade unlocks:

- Full interactive transcripts with translation (free accounts see the first 10 lines)
- Hundreds of video examples per word (free accounts see 2)
- AI-powered word explanations
- Priority support

Plans start at US$10/mo with a 14-day money-back guarantee. Questions?. See [Subscription](/docs/account/subscription) for all plans, payment methods, and what's included.

## Customize Your Experience

Open [Settings](/docs/general/settings) from your profile menu to adjust:

- **Display** — Theme, translation toggle, phonetics (pinyin, furigana), font size, character set
- **Playback** — Playback speed, auto-pause, karaoke animation, smooth scrolling
- **Speech** — Text-to-speech voice and rate for word pronunciation
- **Review** — How many new vocabulary cards to introduce per day (default: 20)

Settings save automatically and sync across your devices when you're signed in.

## Tips

- **Click everything.** Words in subtitles, words in the dictionary, words in your saved list — they're all interactive.
- **Set your proficiency level** on your [Profile](/docs/account/profile) so Explore starts with the right level filter.
- **Save words as you watch**, not after. The bookmark button is one click and keeps you in the flow.
- **Use keyboard shortcuts** in the video player — Space for play/pause, ←/→ to jump between subtitle lines, R to rewind 2 seconds.
- **Switch languages anytime** from the header. Your settings, saved words, and watch history are tracked per language pair.
- **Read the docs** — each feature page ends with a Tips section that covers shortcuts and workflows you might miss otherwise.
` },
  { path: 'media/explore.md', title: 'Explore.md', category: 'media', content: `# Explore

Discover videos in your target language, matched to your level.

## How It Works

The Explore page shows recommended videos for your language pair. Each video is sourced from YouTube and selected for language learning — we exclude music and entertainment content (those have their own [Music & Entertainment](/docs/media/music) page).

Videos are sorted by popularity and filtered by difficulty when you select a level. The recommendation engine learns from your watch history, so videos you've already watched won't appear again.

## Level Filter

The pills at the top let you filter by proficiency level. The labels adapt to your target language:

| L2 | Pills show |
|---|---|
| Chinese | HSK 1 → HSK 7-9 |
| Japanese | JLPT Pre-N5 → N1 |
| Korean | TOPIK Pre-1 → 6 |
| English | IELTS 1 → 9 |
| Others | CEFR Pre-A1 → C2 |

Click a pill to filter videos at that level. Click **All** to see videos at every level. The filter remembers your choice as you browse, and resets to your saved proficiency level when you return.

## Video Cards

Each card shows a color-coded **level badge** in the top-left corner. See [How Difficulty Is Calculated](#how-difficulty-is-calculated) for how these levels are determined.

Click any card to open the video player. When you return to Explore, your place in the list is preserved exactly where you left it.

### Channel Actions

Each video card has a **…** menu in the top-right corner with two options:

- **Subscribe** — Videos from this channel will appear first in your recommendations. About 25% of each page is reserved for subscribed channels, so you'll always see their newest content near the top. This is useful for channels you want to follow regularly — news outlets, educational creators, or your favorite vloggers.

- **Not interested** — Videos from this channel will be hidden from your recommendations entirely. This is useful for channels that consistently show up but aren't a good fit — maybe the content is too advanced, too easy, or just not relevant to your learning goals.

Your channel preferences are saved per language, so subscribing to a Japanese news channel won't affect your Korean recommendations. You can manage all your subscriptions and hidden channels from your profile.

## How Difficulty Is Calculated

Every video is assigned a difficulty score based on the frequency of words in its subtitles. The system uses per-language Zipf frequency lists — large tables that rank how common each word is in real-world text. A word like "the" has a high frequency (common), while "sesquipedalian" has a low frequency (rare).

The scores are bucketed into 7 levels using exponential thresholds: the top 1/127 most frequent words are level 1, the next 2/127 are level 2, the next 4/127 are level 3, and so on — doubling each step. Level 7 covers the rarest 64/127 of words.

Because word frequency distributions differ between languages, the thresholds are **language-specific**. A difficulty score of 0.008 in Japanese maps to JLPT N1 (level 6), while the same score in Korean maps to TOPIK 3 (level 4). The frontend fetches these thresholds once from the backend and uses them to label every video card.

Your channel preferences are saved per language, so subscribing to a Japanese news channel won't affect your Korean recommendations. You can manage all your subscriptions and hidden channels from your profile.

## Tips

- Set your proficiency level on your [profile page](/docs/account/profile) so Explore starts with the right filter
- Switch levels to find easier or harder content — switching back is instant
- Use [Music & Entertainment](/docs/media/music) for music videos and entertainment content
- Your watch history is private and only used to avoid showing the same video twice
` },
  { path: 'media/live-tv.md', title: 'Live Tv.md', category: 'media', content: `# Live TV

watch live television broadcasts in your target language. No subtitles, no dubbing — just real TV as it airs.

## How It Works

Language Player streams live broadcasts from free-to-air channels around the world. The video player uses HLS streaming, which works in all modern browsers. Pick a channel from the list on the right and it starts playing immediately.

Channels are tested automatically every few hours. Dead channels or streams that time out are removed from the list, so you only see channels that are actually broadcasting right now.

## Browsing Channels

The channel list shows every available channel for your target language, sorted by connection speed. The fastest channels appear at the top.

Use the dropdowns at the top of the list to narrow things down:

- **Country** — filter by the channel's country of origin
- **Category** — filter by content type (News, Entertainment, Music, Sports, etc.)

Each channel shows a signal indicator. Green means a fast connection to that channel's server. Yellow and orange mean moderate latency. A grey crossed-out icon means the channel couldn't be reached during the last check and has been removed.

Click any channel to switch to it. The URL updates automatically, so you can bookmark or share a link to a specific channel.

## Tips

- News channels tend to have the most reliable, lowest-latency streams
- If a stream stops working, refreshing the page will re-fetch the channel list with fresh health checks
- Live TV is pure immersion — there are no subtitles or translations. Use the [Video Player](/docs/media/video-player) if you want interactive captions
- Try channels from different countries that speak the same language (e.g., France, Belgium, and Switzerland for French) to hear different accents and vocabulary
` },
  { path: 'media/music.md', title: 'Music.md', category: 'media', content: `# Music & Entertainment

Music videos and entertainment content for your target language.

## How It Works

This page works exactly like [Explore](/docs/media/explore), but only shows music (YouTube category 10) and entertainment (category 24) videos. Everything else — level filters, infinite scroll, video cards, and channel subscriptions — works the same way.

Music and entertainment content is separated from the main Explore page so your learning feed stays focused on general content like vlogs, news, educational videos, and conversations.

## Why Separate?

Music videos and entertainment make up a significant portion of YouTube content. For example, in our database of Japanese videos at the JLPT N1 level, about one-third (3,190 out of 9,489) fall into these two categories. Mixing them into Explore would dominate the feed and crowd out other content types. Keeping them separate gives you control over when you want music and when you want other types of videos.

## Channel Subscriptions

If you subscribe to a music or entertainment channel, those videos still appear here. The channel subscription system works across both pages — your preferences are shared.

## Tips

- Use the level filter to find music at your proficiency level
- Subscribe to your favorite music channels to see their newest videos first
- Switch between Explore and Music & Entertainment to vary your learning
` },
  { path: 'media/search.md', title: 'Search.md', category: 'media', content: `# Search

Find videos and channels in your target language, or jump straight to any YouTube video.

## What You Can Do

The search page is the fastest way to find content in your target language (L2). You can:

- **Search... title** — Type what you want to watch and get matching videos
- **Open any YouTube video** — Paste a YouTube URL to watch it instantly with interactive subtitles
- **browse popular tags** — Explore trending topics in your target language

## How to Search

Type a keyword into the search bar and click **Search... Language Player looks through all available videos and returns matches by title. You'll see video cards with thumbnails, titles, difficulty levels, and view counts.

Search... your target language for the best results. For example, if you're learning Japanese, search \\`料理\\` (cooking) instead of "cooking."

The search updates the page URL, so you can bookmark or share your search results.

## Opening Any YouTube Video

You don't need to search for a video that's already in our database. You can paste **any YouTube URL** directly into the search bar and Language Player will open it with full interactive subtitles and dictionary lookup.

Paste any of these:

- A full YouTube URL: \\`https://www.youtube.com/watch?v=dQw4w9WgXcQ\\`
- A short YouTube link: \\`https://youtu.be/dQw4w9WgXcQ\\`
- An embedded link: \\`https://www.youtube.com/embed/dQw4w9WgXcQ\\`

As soon as Language Player recognizes a YouTube link, it takes you straight to the watch page where you can see the video with synced subtitles, click any word for its definition, and save words to your vocabulary list.

See [watch Page](/docs/media/watch) for details on the video player.

## popular tags

When you first open the search page, you'll see a tag cloud of popular topics in your target language. These are the most-searched terms by other learners. Click any tag to search for it instantly — a great way to find content when you're not sure what to look for.

tags vary by language. A Japanese learner might see \\`ニュース\\` (news), \\`アニメ\\` (anime), and \\`料理\\` (cooking), while a Spanish learner might see \\`música\\`, \\`noticias\\`, and \\`cocina\\`.

## Search Results

Each result shows a video card with:

- **Thumbnail** — A preview image from the video
- **title** — The video title in your target language
- **Difficulty** — CEFR level or equivalent (A1–C2, JLPT N5–N1, HSK 1–6)
- **View count** — How many times the video has been watched on YouTube

Click any video to open it in the watch page with interactive dual subtitles.

## Tips

- Use **target language keywords** — you'll get more relevant results than searching in your native language
- **Paste YouTube links** instead of searching when you already know which video you want to watch — it's faster and works for any video on YouTube
- browse **popular tags** when you want inspiration — they're a window into what other learners are watching
- The search bar **detects YouTube URLs in real time**, so you don't even need to press Enter

` },
  { path: 'media/subs-search.md', title: 'Subs Search.md', category: 'media', content: `# Subtitle Search

Search for any word or phrase across millions of video subtitles. See how native speakers actually use it — in context, with timestamps, ready to watch.

## How It Works

Type a word or phrase in your target language, and Language Player searches every subtitle line in its video database. Results show you exactly where that word appears, in which video, and at what moment.

You can access subtitle search in two ways:

- **From a dictionary entry** — open the **Examples from Videos** tab on any dictionary entry page. It searches for the headword across all subtitles automatically.
- **From the explore page** — use the search bar on the Explore page to find words or phrases in video subtitles.

## Understanding the Results

Each result shows:

- **The subtitle line** containing your search term, with the matching word or phrase highlighted.
- **The video title** — click it to open that video.
- **A timestamp link** — click it to jump directly to the moment the line is spoken. The video starts playing from that exact subtitle line.

Results are grouped by video. If a word appears multiple times in the same video, each occurrence gets its own result line. This way you can compare different contexts for the same word in the same video.

## Exact vs. Partial Matching

By default, the search matches inflected and conjugated forms of your word. For example, searching for "食べる" (to eat) also finds "食べた" (ate), "食べます" (eat, polite), and other forms.

Toggle **Exact Match** to restrict results to the exact form you typed. This is useful when you want to see how a specific conjugation or tense is used, rather than all forms of the word.

## Tips

- **Use it to verify usage** — before using a new word yourself, check how native speakers use it in real conversations.
- **Jump between examples** — click different timestamps for the same word to hear it in different contexts, accents, and speaking speeds.
- **Combine with saved words** — save a word from the dictionary, then use the Examples tab to find videos where you can hear it in action.
` },
  { path: 'media/tv-shows.md', title: 'Tv Shows.md', category: 'media', content: `# TV Shows

Browse TV series in your target language and watch full episodes with interactive dual subtitles.

## How It Works

The TV Shows page lists every TV series available in your target language. Each show is a card with a cover image, the show's title, release year, and country of origin. Click any show to see its episodes.

Episodes are organized by series and numbered in order. Click any episode to open it in the [Video Player](/docs/media/video-player) — every episode gets interactive subtitles and dictionary lookup, just like any other video.

When you play an episode, the entire series is queued up automatically. Use the **Previous** and **Next** buttons to move between episodes without going back to the list.

## Finding Shows

### Search

Use the search bar at the top of the page to find a show by name. Type a keyword in your target language and the list filters instantly — no need to press Enter.

### Sort

Sort the list three ways:

- **Most Viewed** — shows with the most-watched episodes first. Good for finding popular series.
- **Title** — alphabetical by show title. Good when you know the name.
- **Year** — newest shows first. Good for discovering recent series.

### Locale Filter

Some languages are spoken in multiple countries. For example, French TV comes from France, Belgium, Switzerland, and Canada. The **FILTER BY LOCALE** dropdown lets you narrow the list to shows from a specific country. It only appears when more than one locale is available.

## Episode View

After clicking a show, you'll see:

- The **show title** and country of origin at the top
- A list of **all episodes**, numbered and sorted by title
- Each episode row shows a thumbnail, title, duration, and view count

Click any episode to start watching. The video player opens with the full series queued — you can skip between episodes with the Previous/Next controls in the player.

A **Back** button at the top returns you to the show list. Your place in the list is preserved, so you can quickly pick another show without starting over.

## Tips

- Sort by **Most Viewed** when exploring a new language — popular shows tend to have better subtitle quality
- Bookmark a show's page to jump straight to its episodes without searching
- The whole series queues up when you play an episode, so you can binge-watch without interruptions
- Use the [Explore](/docs/media/explore) page for individual videos, not full TV series
- If a show has episodes in multiple languages, filter by locale to see only the ones in your target language
` },
  { path: 'media/video-player.md', title: 'Video Player.md', category: 'media', content: `# Video Player

Watch videos with interactive dual subtitles — click any word to see its definition and save it to your vocabulary list.

## How It Works

The video player opens when you click any video card on the [Explore](/docs/media/explore) page, from your [Watch History](/docs/media/watch-history), from the [TV Shows](/docs/media/tv-shows) page, or the [Search](/docs/media/search) page.

The page embeds the YouTube video and displays interactive subtitles in a separate transcript panel beside or below the video. The player synchronizes with the transcript — as the video plays, the current subtitle line is highlighted and the transcript scrolls automatically to follow along.

### Page Layout

The layout adapts to your screen size:

- **Wide screens** (≥1024px) — A two-column layout: the video, controls, and video info on the left; the transcript and queue in a panel on the right. Each side scrolls independently.
- **Narrow screens** — A single column: the video sticks to the top as you scroll through the controls, video info, and transcript below.

### Video Info

Above the controls, the page shows the video's title, view count, likes, comments, and publish date. A color-coded difficulty badge shows the CEFR level (or language-specific equivalent like HSK, JLPT, or TOPIK). The video's locale, category, and YouTube channel are shown as well.

## Transcript Panel

The right sidebar (or the section below the video on narrow screens) has two tabs:

- **Transcript** — The interactive subtitles with clickable words
- **Queue** — Upcoming videos when watching from a list or TV show

### Interactive Words

Every word in the transcript is clickable. When you click a word, a dictionary popup appears with definitions, pronunciation, example sentences, conjugations, and more. See [Dictionary](/docs/vocab/dictionary) for details on what each entry contains.

Words you've already saved to your vocabulary list appear with a subtle yellow highlight.

Click a subtitle line (outside of any word) to seek the video to that timestamp.

### Translation

The translation toggle above the transcript switches between showing and hiding L1 translations below each L2 line. When off, you see only the L2 text.

Translations are generated automatically. A progress counter shows how many lines have been translated so far.

### Phonetics

The phonetics toggle shows pronunciation guides above each word:

- **Chinese** — pinyin above each word
- **Japanese** — furigana above kanji characters (kana are left as-is)
- **Other languages** — word-level pronunciation where available

Toggle it off to read without pronunciation aids.

## Player Controls

The control bar sits below the video with these buttons:

| Control | What it does |
|---|---|
| **Play / Pause** | Toggle playback |
| **Previous line** | Jump to the previous subtitle line |
| **Next line** | Jump to the next subtitle line |
| **Rewind** | Go back 2 seconds |
| **Speed** | Cycle through playback speeds: 1× → 0.75× → 0.5× |
| **Seek bar** | Click anywhere on the bar to jump to that point in the video |
| **Previous video** | Go to the previous video in your queue |
| **Next video** | Go to the next video in your queue |

The previous/next video buttons only appear when you have a queue, such as from [Explore](/docs/media/explore) or [TV Shows](/docs/media/tv-shows).

## Keyboard Shortcuts

You can control the player from your keyboard:

| Key | Action |
|---|---|
| **Space** | Play / Pause |
| **←** (left arrow) | Previous subtitle line |
| **→** (right arrow) | Next subtitle line |
| **Shift + ←** | Previous video in queue |
| **Shift + →** | Next video in queue |
| **R** | Rewind 2 seconds |

Shortcuts only work when the page has focus — they won't work while typing in a text field or when the YouTube player has captured your keyboard input. Click outside the video to return focus to the page.

## Queue

When you start watching from Explore, TV Shows, or another list, a queue is created automatically. The **Queue** tab (next to the transcript) shows all upcoming videos as compact cards. Click any video to jump to it, or let autoplay take you through in order.

TV show episodes are numbered and grouped by series.

## Resume Playback

Your playback position is saved automatically in your browser and whenever you close the tab. When you return to a video, it picks up right where you left off. If you're logged in, your position syncs across devices.

## Tips

- Click words you don't know and save them to your vocabulary list
- Click a subtitle line to jump the video to that moment
- Use ← and → to replay lines
- Slow down playback with the speed toggle when needed
- Use the queue to watch through a TV show or channel in order
` },
  { path: 'media/watch-history.md', title: 'Watch History.md', category: 'media', content: `# Watch History

Every video you watch is saved to your history. Pick up where you left off, replay favorites, and track what you've been watching.

## How It Works

Language Player saves your watch history automatically. Every 15 seconds while you're watching a video, your current playback position is recorded. When you return to a video later, you can resume from where you left off.

Your history is per-language — switching from Japanese to Korean shows a different list. It's also tied to your account, so it follows you across devices.

## Viewing Your History

Open **Watch History** from the main navigation menu. You'll see a list of every video you've watched in your current target language, most recent first.

Each item shows:

- A **thumbnail** with a play button that appears on hover
- The **video title**
- The **duration** and the **date** you watched it
- A **progress bar** on the thumbnail — a colored line at the bottom shows how much you've watched
- A **percentage** like "{pct} watched" so you know your place at a glance

Click any video to resume watching. The entire history becomes your queue, so you can skip between recently watched videos with the Previous/Next controls in the player.

## Where History Appears

Your watch history shows up in two places:

- **The Watch History page** — your full history for the current language, with every video you've watched
- **Your [Profile](/docs/account/profile)** — the last 5 videos you watched, with a link to see the full list

## Resume Playback

When you reopen a video you've watched before, the player restores your saved position. The progress bar on the seek bar and the percentage in your history list both reflect where you left off.

Position is saved even if you close the tab mid-video. As long as you were watching for at least a few seconds, your place is preserved.

## Privacy

Your watch history is private. It's only visible to you when you're signed in. It's used to:

- Show your recently watched videos for easy access
- Avoid recommending videos you've already seen on the [Explore](/docs/media/explore) page

## Tips

- Use your history as a quick way to replay a video you didn't finish
- The progress bar on each thumbnail gives you an instant sense of where you left off
- Switch languages to see separate histories for each language you're learning
- Your history is scoped to your current L2 — you won't see Japanese videos when you're in Korean mode
` },
  { path: 'reading/epub.md', title: 'Epub.md', category: 'reading', content: `# EPUB Reader

Read EPUB e-books with interactive word lookup, per-block translation, and progress that persists across sessions.

## Getting Started

### Upload an EPUB

1. Navigate to **Reading → EPUB Reader** in the menu
2. **Drag & drop** an \\`.epub\\` file onto the upload zone, or click **Browse** to select one from your device
3. The cover image appears — tap it to start reading

The file is stored locally in your browser (IndexedDB). Next time you visit, it will load automatically and you'll resume from where you left off.

### Navigation

| Feature | How |
|---|---|
| **Next/Previous chapter** | Use the buttons at the top of the sidebar, or click chapter titles in the table of contents |
| **Collapse/expand sidebar** | Click the \\`≡\\` toggle in the top-right corner of the title bar |
| **Close the book** | Click \\`✕ Close\\` in the title bar to return to the upload screen |
| **Page turn within a chapter** | Use \\`←\\` / \\`→\\` keys or the page controls at the bottom of the reader |
| **Table of contents** | Nested TOC items are indented for easy navigation |

### Reading Features

- **Click any word** to look up its dictionary definition, pronunciation, and example sentences
- **Per-block translation** — Click the \\`Languages\\` icon in the page nav bar to translate the current page's visible blocks
- **Auto-translate on page turn** — When translation is enabled, the next page's content is translated automatically
- **Inline translation display** — On wide screens, original and translation appear side by side. On narrow screens, translation appears below each block.

## Supported Formats

- **\\`.epub\\`** — Standard EPUB files (EPUB 2 and EPUB 3)
- **\\`.epub\\` with furigana/ruby** — Japanese books with ruby annotations are stripped of furigana, keeping only the base kanji text
- **Vertical text** — Books with CSS \\`writing-mode: vertical-rl\\` are detected (display uses standard horizontal layout for readability)

## Progress Saving

Your reading position is saved automatically in your browser:

- **Current chapter** is saved when you switch chapters
- **Text anchor** (the first ~40 characters of the visible page) is saved when you turn pages
- On your next visit, the book reloads and scrolls to the correct position

**Note:** Progress is stored locally (IndexedDB), not synced to the cloud. Only one book is stored at a time — uploading a new one replaces the previous.

## Getting Free EPUBs

- **[Project Gutenberg](https://www.gutenberg.org/)** — 70,000+ free ebooks in many languages (look for " EPUB with images" or " Plain Text UTF-8")
- **[Aozora Bunko](https://www.aozora.gr.jp/)** (青空文庫) — Japanese literature, public domain
- **[Wikisource](https://wikisource.org/)** — Public domain texts in many languages, downloadable as EPUB
` },
  { path: 'reading/reader.md', title: 'Reader.md', category: 'reading', content: `# Notes Reader

Paste or write text in your target language and read it with interactive word lookup, per-block translations, and a built-in note-taking system.

## How It Works

The Notes Reader lets you bring your own text — paste an article, type a journal entry, or load a web page. The reader tokenizes the text so every word becomes clickable. You can look up words in the dictionary, see translations, and save everything as a note that you can return to later.

## Getting Text In

There are three ways to add text:

- **Write or paste** — Switch to the Edit tab and type or paste directly into the text area. Markdown formatting is supported (headings, lists, blockquotes, code, tables).
- **Load a URL** — Paste a web page URL into the URL input at the top. The reader fetches the page and converts it to readable text.
- **Fill with sample** — Click "Fill with sample" to load a short example text in your target language, useful for exploring the reader's features.

Each piece of text you work with is saved as a **note**. All your notes appear in the sidebar on the left. Click any note to load it back — your text, translations, and reading position are remembered.

## Reading

### Edit Mode

The **Edit** tab is where you add or edit text. Type directly into the text area, or paste from an external source. When you're ready to read, click **Tokenize** to make every word interactive.

Markdown is fully supported. Use \\`#\\` for headings, \\`*\\` or \\`-\\` for lists, \\`>\\` for blockquotes, and backticks for code. The reader preserves your formatting in the Read tab.

### Read Mode

The **Read** tab shows your text paginated to fit the screen. Each page shows as much text as fits without scrolling.

**Navigate pages** with the \\`←\\` \\`→\\` buttons at the bottom, or use your keyboard: \\`←\\` and \\`↑\\` for previous page, \\`→\\`, \\`↓\\`, and \\`Space\\` for next page.

## Interactive Words

After tokenization, every word is clickable. Tap or click any word to open the [Popup Dictionary](/docs/vocab/popup-dictionary). You can see definitions, pronunciations, example sentences, and save the word to your vocabulary.

Words you've previously saved are shown with a quick gloss — the first definition appears inline next to the word.

## Translation

Toggle the **Translation** switch in the page navigation bar to show or hide translations. This setting is remembered across sessions.

When enabled, translations appear inline — on wide screens they sit next to the original text, and on narrow screens they appear below each paragraph. Translations are fetched per page and appear as you navigate.

**Per-block actions** let you interact with each paragraph individually. Hover over any text block to reveal a \\`⋮\\` menu with these options:

- **Copy** — Copy the text to your clipboard
- **Speak** — Read the text aloud with text-to-speech
- **Let DeepSeek Explain** — Get an AI breakdown of the text's grammar and structure
- **Translation** — See a popup translation for just that block

## Managing Notes

All your notes appear in the sidebar. You can:

- **Create a new note** — Click "New Note" to start with a blank text area
- **Rename a note** — Click the \\`⋮\\` next to a note and choose Rename
- **Delete a note** — Click the \\`⋮\\` next to a note and choose Delete

Your note is saved as you type. There's no save button — changes are saved to your account after a brief pause. When you switch between notes or close the reader, your latest changes are always preserved.

## See Also

- [Web Reader](/docs/reading/web-reader) — Read web articles by URL without saving notes
- [EPUB Reader](/docs/reading/epub) — Read EPUB books with chapter navigation
- [Popup Dictionary](/docs/vocab/popup-dictionary) — How clicking words works
- [Dictionary](/docs/vocab/dictionary) — Full dictionary features

## Tips

- Use markdown headings to organize longer texts — they help break content into readable sections
- The \\`⋮\\` menu on each block is a quick way to look up a single word or phrase without switching tabs
- Keyboard navigation (\\`←\\` \\`→\\`) is faster than clicking page buttons for extended reading
- Rename your notes to something descriptive — "Chapter 3 notes" is easier to find later than "Untitled"
` },
  { path: 'reading/web-reader.md', title: 'Web Reader.md', category: 'reading', content: `# Web Reader

Paste a URL and read any web page in your target language with interactive word lookup and translations. No account needed.

## How It Works

Enter the URL of a web page — a news article, a blog post, a Wikipedia page, or any public webpage. The Web Reader fetches the page, strips away navigation and ads, and displays the main content as clean, readable text. Every word becomes clickable for dictionary lookup.

The Web Reader is read-only — it doesn't save anything to your account. If you want to keep your text and come back to it later, use the [Notes Reader](/docs/reading/reader) instead.

## Loading a Page

1. Paste a full URL (starting with \\`https://\\`) into the input at the top of the page
2. Click **Load**
3. The page content appears as clean text, ready to read

You can also share a link directly. Add \\`?url=\\` to the Web Reader URL:

\\`\\`\\`
/en/zh/web-reader?url=https://zh.wikipedia.org/wiki/...
\\`\\`\\`

This loads the page when someone opens the link.

## What Gets Kept

The Web Reader extracts the main content of a page and removes clutter:

- Navigation menus, sidebars, headers, and footers are stripped
- Wikipedia edit links, reference lists, infoboxes, and metadata are removed
- The main article body is preserved — paragraphs, headings, lists, and links
- Relative links are rewritten to point back to the original page

The cleaned content is displayed as formatted text with markdown styling. Headings, bullet lists, blockquotes, and code blocks all render as you'd expect.

## Interactive Words

After the page loads, click **Tokenize** to make every word interactive. Tap or click any word to open the [Popup Dictionary](/docs/vocab/popup-dictionary). You can see definitions, pronunciations, and example sentences, and save words to your vocabulary.

Words you've previously saved are highlighted — the first definition appears inline next to the word as a quick reminder.

## Translation

Toggle the **Translation** switch to show or hide translations. When enabled, translations appear inline — on wide screens they sit next to the original text, and on narrow screens they appear below each paragraph. Translations load as you navigate between pages.

**Per-block actions** let you interact with each paragraph individually. Hover over any text block to reveal a \\`⋮\\` menu with these options:

- **Copy** — Copy the text to your clipboard
- **Speak** — Read the text aloud with text-to-speech
- **Let DeepSeek Explain** — Get an AI breakdown of the text's grammar and structure
- **Translation** — See a popup translation for just that block

## Page Navigation

The text is paginated to fit your screen. Use the \\`←\\` \\`→\\` buttons at the bottom to move between pages, or use your keyboard: \\`←\\` and \\`↑\\` for previous page, \\`→\\`, \\`↓\\`, and \\`Space\\` for next page.

## See Also

- [Notes Reader](/docs/reading/reader) — Write or paste your own text, save notes, and edit content
- [EPUB Reader](/docs/reading/epub) — Read EPUB books with chapter navigation
- [Popup Dictionary](/docs/vocab/popup-dictionary) — How clicking words works

## Tips

- Wikipedia articles work particularly well — the content extraction is tuned for Wikipedia's layout
- Use the \\`?url=\\` parameter to bookmark specific articles in your target language
- The Web Reader doesn't save your text — if you want to annotate or come back later, copy the URL and paste it into the Notes Reader instead
- Long articles benefit from keyboard navigation (\\`←\\` \\`→\\`) for faster reading` },
  { path: 'vocab/dictionary.md', title: 'Dictionary.md', category: 'vocab', content: `# Dictionary

The dictionary is your instant word lookup tool. It works everywhere — in subtitles, in search, and on its own dedicated page.

## Looking Up Words

You can look up a word in three ways:

- **Tap any word** in the subtitles or transcript while watching a video. A popup opens with the definition, pronunciation, and a bookmark button. See [Popup Dictionary](/docs/vocab/popup-dictionary) for details.
- **Use the search bar** at the top of the Dictionary page. Type a word in your target language and press Enter.
- **Click a saved word** in your vocabulary list to jump straight to its full entry.

The search bar is always there — it never moves. Whether you're browsing results or reading a full entry, the search bar stays at the top so you can look up another word instantly.

## What You Get

Every entry gives you the essentials up front:

- **Definitions** in your native language, ordered by relevance
- **Pronunciation** — tap the speaker icon to hear it aloud, plus a phonetic guide (Pinyin, Romaji, or IPA)
- **Part of speech** — noun, verb, adjective, and so on
- **Proficiency level** — where the word falls on scales like CEFR (A1–C2), HSK (1–6), or JLPT (N5–N1)

Depending on the language and the word, you might also see:

- **Alternate scripts** — for Chinese, see the word in both simplified and traditional. For Vietnamese, see the Chữ Hán form. For Korean, see the Hanja. You control which scripts appear in [Settings](/settings).
- **Classifiers** — for Chinese, see which measure words go with the noun (like 个, 本, 张). For French or German, see the grammatical gender.
- **Textbook coverage** — if the word appears in a textbook like the HSK Standard Course, you'll see exactly which book, lesson, and dialog it's from.

### Tabs

The entry page has tabs next to the definitions panel:

- **Examples from Videos** — see real subtitle lines from YouTube videos that contain this word. Great for hearing how it's actually used. Learn more in [Subtitle Search](/docs/vocab/subs-search).
- **Conjugations** — full conjugation or declension tables for verbs and adjectives. Available for Japanese, Korean, Russian, Ukrainian, English, French, German, Spanish, Italian, and Dutch.
- **AI Explanation** — a plain-English breakdown of the word's meaning, usage, and nuances. Generated on the fly by DeepSeek.

## Where Dictionary Entries Come From

Language Player uses curated, versioned dictionaries built from open data:

| Language | Dictionary | Entries |
|---|---|---|
| Chinese | HSK CEDICT | 120,000+ |
| Cantonese | CC-Canto | 50,000+ |
| Japanese | EDICT | 170,000+ |
| Korean | Kengdic | 120,000+ |
| Klingon | Klingonska | 3,000+ |
| 60+ other languages | Wiktionary | varies by language |

If a word isn't in any dictionary — like a rare dialect word or a new slang term — the app asks an AI model to generate a definition on the spot. These AI-generated entries are marked so you know they're not from a curated source.

## Saving Words

Click the bookmark icon on any dictionary entry to save the word to your personal vocabulary list. Your saved words appear in the sidebar while you're browsing the dictionary, so you can quickly jump between them.

Saved words sync across devices if you're logged in. You can browse and manage them on the [Saved Words](/docs/vocab/saved-words) page. Use the [Review](/docs/vocab/review) feature to practice your saved words with spaced repetition — the app schedules reviews so you see each word just before you'd forget it.

## Tips

- **Click the speaker icon** next to any word to hear its pronunciation. This works in the popup, the search results, and the full entry page.
- **Use the sidebar toggle** (the panel icon in the search bar) to show or hide your saved words list while browsing entries.
- **Search Google Images** from any entry page — the link is at the bottom of the definitions panel. Useful for concrete nouns when a picture is worth a thousand words.
- **If a word's definition seems off**, check the AI Explanation tab. The AI sometimes catches nuances that dictionary definitions miss.
- **Switch scripts** in [Settings](/settings) if you prefer traditional Chinese characters or want to see Hanja alongside Korean Hangul.

` },
  { path: 'vocab/popup-dictionary.md', title: 'Popup Dictionary.md', category: 'vocab', content: `# Popup Dictionary

Click any word in the subtitles or transcript, and a popup opens with everything you need — definitions, pronunciation, and a quick way to save the word.

## How It Works

While watching a video, every word in the subtitles is clickable. When you tap a word:

1. A popup appears next to the word with dictionary entries from our curated dictionaries.
2. If the word isn't in any dictionary, an AI model generates a definition on the spot.
3. You can scroll through multiple entries if the word has several meanings.

The popup stays open until you click outside it or press the close button.

## What's in the Popup

Each dictionary entry in the popup is a compact card showing:

- **Headword** with pronunciation and alternate scripts
- **Definitions** ordered by relevance
- **Part of speech** and proficiency level badges
- **Save button** — click the bookmark icon to add this word to your vocabulary list

Below the dictionary entries, an **AI Explanation** section gives you a plain-language breakdown of the word's meaning and usage. This is especially helpful for words with multiple senses or tricky grammar.

## Saving Words from the Popup

Click the bookmark icon on any entry to save it. The app automatically fetches all inflected and conjugated forms of the word, so every form you encounter in the future will be recognized as saved.

When you save a word from a video, the subtitle line and video title are stored as context. You'll see exactly where you first encountered the word when you browse your [Saved Words](/docs/vocab/saved-words) list.

## Full Dictionary Entry

Click any entry card in the popup to jump to the full dictionary page. The full page gives you everything the popup does, plus:

- Conjugation tables for verbs and adjectives
- Real video examples from our subtitle database
- Textbook appearances (HSK Standard Course and more)
- A Google Images search link

## Unrecognized Saved Words

If you have a word saved in your vocabulary but none of the popup's dictionary entries match it, the popup shows an "unrecognized saved word" warning. This can happen when a saved word uses an older ID format that doesn't match the current dictionary. The warning lets you know the word is still in your list — it just couldn't be matched to a specific entry in this popup.

## Tips

- **Click the entry card** (not just the bookmark) to open the full dictionary page for more detail.
- **Save first, read later** — bookmark interesting words as you watch, then review them in your [Saved Words](/docs/vocab/saved-words) list after the video.
- **The popup works on any word** — even conjugated verbs, declined nouns, and words with typos. The lemmatizer finds the dictionary form automatically.
` },
  { path: 'vocab/review.md', title: 'Review.md', category: 'vocab', content: `# Review

Review your saved vocabulary with spaced repetition flashcards.

## How It Works

Each saved word becomes a flashcard. The front shows the sentence where you saved the word — the word itself is highlighted so you can spot it instantly. Your job is to recall the meaning from context.

Tap the card (or press Space) to reveal the back. You'll see the full dictionary entry with definitions, examples, inflections, and an AI explanation. Compare what you recalled with the actual definition, then rate yourself.

The next time you see the word depends on your rating. Words you know well appear less often. Words you struggle with come back sooner. This is called spaced repetition — it's the same technique used by Anki.

## Rating a Card

After revealing the back, rate how well you remembered:

| Button | Key | When to use |
|---|---|---|
| Again | 1 | You forgot entirely |
| Hard | 2 | You recalled with difficulty |
| Good | 3 | You recalled correctly |
| Easy | 4 | You recalled instantly |

You can also tap the **left half** of the card for Again, or the **right half** for Good. A colored toast confirms your choice.

## Card Counts

The top of the screen shows three colored indicators:

- **Blue** — New cards you're seeing for the first time today
- **Red** — Cards you're relearning after forgetting
- **Green** — Cards coming back for a scheduled review

The daily limit for new cards is 20 by default. You can change it in [Settings](/docs/general/settings).

## Context & Translation

Every card shows the sentence where you saved the word. The exact word form is highlighted. Below it you'll see where the word came from (the video title or text name, plus the date).

If you have "Show Translation" enabled in Settings, the card shows the English translation of the sentence when you reveal the back. If no saved translation exists, it fetches one automatically.

The context sentence has a hover menu (the three dots) for copying the text, speaking it aloud, getting an AI explanation, or translating it on the spot.

## Removing a Word

To remove a word from your review deck, unsave it from the dictionary entry on the back of the card. The next card slides into place automatically.

## Keyboard Shortcuts

- **Space** or **Enter** — Reveal the back, or rate Good (when back is shown)
- **1–4** — Rate Again, Hard, Good, Easy (when back is shown)

## Tips

- Review daily. Even 5 minutes makes a difference.
- Be strict with Again. If you couldn't recall it in real life, it counts as a fail.
- Use the context sentence. Seeing the word in its original sentence is more effective than memorizing in isolation.
- Tap the three dots on the context sentence to translate or explain the full line before rating.
- Adjust your daily new card limit in Settings if 20 feels too many or too few.
` },
  { path: 'vocab/saved-words.md', title: 'Saved Words.md', category: 'vocab', content: `# Saved Words

Your personal vocabulary collection. Every word you bookmark from subtitles, the dictionary, or the popup ends up here.

## How Words Get Saved

You can save a word from anywhere:

- **In a video** — click a word in the subtitles, then hit the bookmark icon in the popup.
- **In the dictionary** — click the bookmark on any search result or entry page.
- **From the sidebar** — while browsing one entry, click a saved word in the sidebar to jump to it.

When you save a word, the app automatically fetches all its inflected and conjugated forms. This means when you encounter "went" later, it's recognized as the same word you saved as "go."

## Browsing Your Collection

The Saved Words page lists every word you've bookmarked for your current target language. You can:

- **Search** — type in the filter box to find words by their form, the sentence they appeared in, or the video title.
- **Sort** — switch between newest first or alphabetical order.
- **Scan by date** — words saved today are grouped separately from older ones.

Each word row shows the head form, its definition, the sentence context, and where it came from (video title, textbook, or dictionary).

Click any word to open its full dictionary entry.

## Export and Clear

- **Export** — download your entire vocabulary list as a JSON file. Useful for backups or importing into other tools.
- **Clear all** — remove every saved word for this language. This can't be undone.

## Review and Practice

Saved words feed into the [Review](/docs/vocab/review) system. The app uses spaced repetition to schedule each word for review just before you'd forget it. Words are shown as flashcards — see the word, recall the meaning, and rate how well you remembered.

A colored dot next to each word in your saved list shows its review status: blue for new, amber for due, red for overdue, green for reviewed.

## Tips

- **Save as you watch** — bookmark interesting words during a video, then review them later. You don't need to stop and study mid-video.
- **Use the filter** to find all words from a specific video or TV show. Type part of the video title in the search box.
- **Export regularly** as a backup. The JSON file includes every form, definition, and context for each word.
- **Click through to the entry** for any saved word to see its full conjugation tables, video examples, and AI explanation.
` },
  { path: 'vocab/subs-search.md', title: 'Subs Search.md', category: 'vocab', content: `# Examples from Videos

See how a word is actually used by native speakers — every result is a real subtitle line from a real video, with a timestamp ready to watch.

## How It Works

Subtitle search is part of the dictionary. Open any word in the [Dictionary](/docs/vocab/dictionary) and go to the **Examples from Videos** tab. The search runs automatically for that word, no typing needed. You can also access it from the [popup dictionary](/docs/vocab/popup-dictionary) when you click a word in subtitles or text.

The search runs across millions of subtitle lines and returns every video where the word appears. An embedded mini-player shows the first result immediately, with the search term highlighted in yellow.

## Navigating Results

Use the arrows above the player to move between videos. Each video may contain multiple matches — use the prev/next line buttons to step through them.

The video counter (e.g., "3 / 50") shows your position in the results. Click **Watch** to open any video in the full [Video Player](/docs/media/video-player).

### List All

Click **List All** to see every matched video as a scrollable list. Each item shows:

- The video thumbnail and title
- The subtitle line containing your word, plus the lines before and after it for context
- A timestamp — click it to jump straight to that moment

You can sort the list by views, likes, date, or line length. There's also a text filter to narrow results by typing part of a subtitle line.

## Multiple Forms vs. Exact Match

By default, the search looks for the word in all its forms — inflections, conjugations, and script variants. For example, searching the Japanese verb 食べる also finds 食べた, 食べます, 食べて, and other forms. For Chinese, it searches both simplified and traditional characters.

Toggle **Exact Match** to restrict results to only the dictionary headword. This shows fewer, more targeted results.

## Tips

- Click through different timestamps for the same word to hear varied accents and speaking speeds
- Save a word first, then browse the Examples tab to find videos where you can hear it in action
- Use the List All view to compare how a word is used across dozens of videos at a glance
` },
];

export const DOC_CATEGORIES: { key: string; title: string }[] = [
  { key: 'account', title: 'Account' },
  { key: 'general', title: 'General' },
  { key: 'getting-started', title: 'Getting Started' },
  { key: 'media', title: 'Media' },
  { key: 'reading', title: 'Reading' },
  { key: 'vocab', title: 'Vocab' },
];