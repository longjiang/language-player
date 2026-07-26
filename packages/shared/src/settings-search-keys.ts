/**
 * Mapping of settings categories to their searchable translation keys.
 * Used by both web and mobile to enable locale-agnostic settings search.
 * Every key must exist in translations.csv.
 */
export const SETTINGS_SEARCH_KEYS: Record<string, string[]> = {
  display: [
    'title.display', 'setting.theme', 'setting.light', 'setting.dark', 'setting.system',
    'label.font', 'setting.font_default', 'setting.font_serif', 'setting.font_sans_serif',
    'label.text_size',
    'label.show_phonetics', 'setting.phonetics_on_top', 'setting.phonetics_replace',
    'setting.off', 'setting.all_words', 'setting.hard_words_only',
    'label.show_gloss_saved', 'label.show_interlinear_gloss',
    'label.character_set', 'setting.simplified', 'setting.traditional',
    'label.show_hanja', 'label.show_hantu',
    'setting.quiz_mode',
    'label.show_translation', 'label.enable_popup_dictionary',
    'label.tokenized_text_preview',
    'label.preview_sentence',
  ],
  playback: [
    'title.playback', 'label.captions_display_as', 'title.transcript', 'label.subtitles',
    'label.smooth_scroll', 'label.karaoke', 'label.auto_pause',
  ],
  speech: [
    'title.speech', 'label.voice', 'label.speed', 'label.pitch', 'label.rate',
    'label.auto_best_for',
  ],
  review: [
    'title.review', 'label.new_cards_per_day',
  ],
  offline: [
    'title.offline_dictionaries',
  ],
};
