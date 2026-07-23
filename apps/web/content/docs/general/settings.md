# {$title.settings}

{$title.settings} controls how {$title.app_name} looks and behaves while you're learning. Open it from your profile menu. {$title.settings} are organized into four tabs — {$setting.display}, {$setting.playback}, {$setting.speech}, and {$setting.review}.

Your settings save automatically. They sync across devices when you're signed in.

## {$setting.display}

Everything that affects how text and subtitles look on screen.

### {$label.theme}

Pick {$setting.light}, {$setting.dark}, or {$setting.system}. {$setting.system} follows your device's appearance setting and switches automatically.

### {$action.translation}

{$label.show_translation} adds a line in your language below each subtitle. Turn it off for immersion, on for comprehension. You can also toggle this from the video player with the {$action.translation} pill button.

### Popup Dictionary

When enabled, tap any word to see its definition, pronunciation, and example sentences. The popup also lets you save words to your [vocabulary list](/docs/vocab/saved-words). When disabled, tapping a word does nothing.

A live preview below the toggle shows how your text will look — you can adjust font, size, and phonetics and see the result immediately.

### {$setting.text_appearance}

**{$label.font}** — {$setting.font_default} uses your browser's standard font. {$setting.font_serif} adds small decorative strokes to characters. Sans-serif uses clean, modern letterforms.

**{$label.text_size}** — A slider from smallest to largest. Changes font size everywhere in the app — subtitles, transcripts, and [dictionary](/docs/vocab/dictionary) entries.

### {$setting.phonetics}

{$setting.phonetics} are pronunciation guides that appear with the text. For {$lang.zh}, this is {$word.pinyin} above characters. For {$lang.ja}, it's Furigana. For other languages, it's a romanized reading.

**{$label.show_phonetics}** has three options:
- **{$setting.phonetics_on_top}** — the pronunciation sits above each word
- **{$setting.phonetics_replace}** — the pronunciation replaces the original script entirely
- **{$setting.off}** — no phonetics at all

When "{$setting.phonetics_on_top}" is selected, a second control appears: **Show For**. Choose **{$setting.all_words}** to annotate everything, or **{$setting.hard_words_only}** to only show phonetics on words above your proficiency level. You can set your proficiency level on your [profile page](/profile).

### {$setting.word_level_display}

**{$label.show_gloss_saved}** shows a short translation above words you've saved to your vocabulary list. It's a quick reminder of what the word means without opening the full dictionary.

**{$label.show_interlinear_gloss}** shows the first dictionary definition below every word in the text. Unlike {$label.show_gloss_saved} (saved words only), this applies to all words.

**{$label.character_set}** is for {$lang.zh} learners — choose between Simplified and Traditional characters. For {$lang.ko}, there's a **{$label.show_hanja}** toggle that displays {$lang.zh} characters alongside Hangul. For {$lang.vi}, **{$label.show_hantu}** adds the original {$lang.zh}-based characters.

### {$setting.interaction}

**{$setting.quiz_mode}** hides saved words in the text and replaces them with blanks. Tap a blank to reveal the word. It's a self-testing tool — see if you can recall a word by reading the surrounding sentence, then tap to check.

## {$setting.playback}

{$title.settings} for how videos play and how subtitles behave.

### {$setting.captions}

**{$label.transcript_mode}** shows the full interactive transcript of a video as a scrollable page, instead of syncing one subtitle line at a time to the video. Use it to read ahead, jump to specific lines, or study the entire dialogue at once.

**{$label.smooth_scroll}** keeps the active subtitle line centered in the transcript panel as the video plays. The transcript scrolls gently to follow along.

**{$label.karaoke}** highlights each word in the current subtitle as it's spoken. The highlight moves word by word, matching the audio.

### {$label.auto_pause}

Pauses the video after each subtitle line finishes. Useful when you want time to read, look up words, and process what you heard before moving on.

### {$label.collapse_video}

Collapses the video player to a compact mini-player when you scroll through the transcript. Gives you more room to read while keeping the video visible.

## {$setting.speech}

Choose the text-to-speech voice used when you play word pronunciations. You can pick a voice for your target language, adjust the speech rate, and test it before saving. See [{$label.pronunciation_voice}](/docs/vocab/dictionary#pronunciation) for more on how pronunciation works in the dictionary.

## {$setting.review}

{$title.settings} for your spaced repetition practice.

**{$label.new_cards_per_day}** sets the maximum number of new vocabulary cards introduced each day. Lower numbers mean fewer new words but more manageable daily sessions. Higher numbers ramp you up faster but increase your daily workload. The default is 20.

See [{$title.saved_words} & {$setting.review}](/docs/vocab/saved-words) for how the review system works.

## Tips

- Toggle Translation on and off from the video player itself — no need to open {$title.settings} every time
- If you find yourself looking up every word, try **{$setting.hard_words_only}** for phonetics to reduce visual clutter
- {$setting.quiz_mode} is most effective with shorter texts — start with a paragraph, not a full article
- Your per-language settings (phonetics, character set, voice) travel with you when you switch between language pairs
