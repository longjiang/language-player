/**
 * Generator: translations.csv + built-in map → _locales/{locale}/messages.json
 *
 * Generates Chrome extension locale files for all 18 supported languages.
 * Where an extension message key matches a CSV key, the CSV translation is used.
 * Extension-specific keys without CSV equivalents use a built-in translation map.
 *
 * Usage: node scripts/generate-locales.js
 */

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const CSV_PATH = path.resolve(__dirname, '../../../translations.csv');
const LOCALES_DIR = path.resolve(__dirname, '../_locales');

// CSV → Chrome locale code mapping (zh-Hans → zh_CN, etc.)
const CSV_TO_CHROME = {
  'en': 'en', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', 'ar': 'ar', 'de': 'de',
  'es': 'es', 'fr': 'fr', 'id': 'id', 'it': 'it', 'ja': 'ja', 'ko': 'ko',
  'nl': 'nl', 'pl': 'pl', 'pt': 'pt', 'ru': 'ru', 'th': 'th', 'tr': 'tr',
  'vi': 'vi',
};

// Extension message key → CSV key (pull translation from monorepo CSV)
const CSV_LOOKUP = {
  'closePanel': 'action.close',
  'changeLanguage': 'action.change_language',
  'allLanguages': 'filter.all',        // CSV has "All", we append "Languages" below
  'translate': 'action.translation',
  'showTranslation': 'label.show_translation',
  'copy': 'action.copy',
  'retry': 'action.retry',
  'speak': 'action.speak',
  'searchImages': 'action.search_images',
  'contextSentence': 'label.context_sentence',
  'openInDictionary': 'action.open_in_dictionary',
  'zoomOut': 'action.zoom_out',
  'zoomIn': 'action.zoom_in',
  'profile': 'title.profile',
  'subtitles': 'label.subtitles',
  'login': 'action.log_in',
  'logout': 'action.log_out',
  'help': 'title.docs',
  'about': 'title.about',
  'account': 'title.profile',
  'learningLevel': 'label.level',
  'level': 'label.level',
  'subscription': 'title.subscription',
  'subscriptionMonthly': 'subscription.monthly_cap',
  'subscriptionAnnual': 'subscription.annual_cap',
  'subscriptionLifetime': 'subscription.lifetime_cap',
  'freeAccount': 'label.free_account',
  'autoRenews': 'label.auto_renews',
  'manageSubscription': 'action.manage_subscription',
  'deleteAccount': 'title.delete_account',
  'deleteSubscriptionFirst': 'msg.delete_account_cancel_subscription_first',
  'typeToConfirm': 'msg.delete_account_type_to_confirm',
  'deleteAccountFailed': 'msg.delete_account_error',
  'cancel': 'action.cancel',
  'myActivities': 'title.my_activity',
  'deleteAccountWarning': 'msg.delete_account_permanent_warning',
  'privacy': 'title.privacy_policy',
  'settings': 'label.settings',
  'display': 'title.display',
  'theme': 'setting.theme',
  'light': 'setting.light',
  'dark': 'setting.dark',
  'system': 'setting.system',
  'sample': 'label.tokenized_text_preview',
  'typeface': 'label.font',
  'defaultTypeface': 'setting.font_default',
  'serif': 'setting.font_serif',
  'sansSerif': 'setting.font_sans_serif',
  'textSize': 'label.text_size',
  'translationSize': 'label.translation_size',
  'leading': 'setting.leading',
  'phonetics': 'setting.phonetics',
  'above': 'setting.phonetics_on_top',
  'replace': 'setting.phonetics_replace',
  'off': 'setting.off',
  'scope': 'label.phonetics_conditions',
  'allWords': 'setting.all_words',
  'hardWords': 'setting.hard_words_only',
  'searchSettings': 'msg.search_settings',
  'playback': 'title.playback',
  'speech': 'title.speech',
  'review': 'title.review',
  // Playback + Speech settings controls (CSV keys exist, so all locales pull
  // their translations from translations.csv).
  'smoothScroll': 'label.smooth_scroll',
  'voice': 'label.voice',
  'rate': 'label.rate',
  'speed': 'label.speed',
  'defaultVoice': 'label.auto_best_available',
  'textAppearance': 'setting.text_appearance',
  'testVoice': 'label.test_voice',
  'noLanguagesFound': 'msg.no_languages_match',
  'traditional': 'setting.traditional',
  'simplified': 'setting.simplified',
  'explain': 'action.let_ai_explain',
  'explainTitle': 'action.let_ai_explain',
  'save': 'action.save_word',
  'saved': 'label.saved',
  'close': 'action.close',
  'removeFromSaved': 'action.remove_from_saved',
  'popupLoginBtn': 'action.log_in',
  'popupLogoutBtn': 'action.log_out',
  'popularLanguages': 'msg.popular_languages',
  'popupChecking': 'msg.checking',
  // Login dialog (web-parity surface)
  'welcomeBack': 'title.welcome_back',
  'logInToContinue': 'msg.log_in_to_continue',
  'forgotPassword': 'action.forgot_password',
  'signUp': 'action.sign_up',
  'dontHaveAccount': 'msg.dont_have_account',
  // Reused existing CSV keys (SPEC-028 optimization)
  'interfaceLanguage': 'placeholder.select_language',
  'learningLanguage': 'placeholder.select_language',
  'actions': 'action.more',
  'aiThinking': 'msg.loading',
  'aiProFeature': 'msg.ai_pro_feature',
  'loadingSubtitles': 'msg.loading',
  'translating': 'subtitle.translating',
  'upgradeToPro': 'action.upgrade_to_pro',
  'upgradeToProBanner': 'msg.upgrade_to_pro_banner',
  'freeSubtitleLimitReached': 'msg.free_subtitle_limit_reached',
  'popupEmailPlaceholder': 'placeholder.email',
  'popupPasswordPlaceholder': 'placeholder.password',
  'noTranscriptFound': 'subtitle.subtitles_unavailable',
  'popupNoTranscript': 'subtitle.subtitles_unavailable',
  // Language switch modal
  'iSpeak': 'title.i_speak',
  'iLearning': 'title.i_learning',
  'searchLanguages': 'placeholder.search_languages',
  'confirm': 'action.confirm',
  'versionLabel': 'label.version',
  // AI explain prompts
  'explainWord': 'prompt.explain_word',
  'explainWordContext': 'prompt.explain_word_context',
  'explainWordContextForm': 'prompt.explain_word_context_form',
  'explainMorphology': 'prompt.explain_morphology',
  'followupInflection': 'prompt.followup_inflection',
  'followupInflectionContext': 'prompt.followup_inflection_context',
  'followupInflectionContextForm': 'prompt.followup_inflection_context_form',
  'followupMorphemes': 'prompt.followup_morphemes',
  'followupMorphemesContext': 'prompt.followup_morphemes_context',
  'followupEtymology': 'prompt.followup_etymology',
  'followupSyntax': 'prompt.followup_syntax',
  'followupSyntaxContext': 'prompt.followup_syntax_context',
  'followupSynonyms': 'prompt.followup_synonyms',
  'followupSynonymsContext': 'prompt.followup_synonyms_context',
  'followupSynonymsExamples': 'prompt.followup_synonyms_examples',
  'inflection': 'action.inflection',
  'morphemes': 'action.morphemes',
  'etymology': 'action.etymology',
  'syntax': 'action.syntax',
  'synonyms': 'action.synonyms',
  'examples': 'title.examples_from_videos',
  'subsAiExamples': 'prompt.subs_ai_examples',
  // Dictionary card states (reuse existing CSV keys)
  'dictLoadFailed': 'log.failed_load_dictionary',
  'noDictionaryEntry': 'msg.no_dictionary_entry',
  'triedLemmas': 'msg.tried_lemmas',
  // Dictionary card classifiers (apps/web DictionaryEntryCard parity)
  'measureWord': 'label.measure_word',
  'genderLabel': 'label.gender_label',
  'nounClass': 'label.noun_class',
};

// Built-in translations for extension-specific keys without CSV equivalents.
// Keyed by CSV column name (zh-Hans, fr, de, etc.).
// Only include languages NOT already handled by manual _locales/ files.
const MANUAL = {
  'settingsUnavailable': {
    'ja': 'この設定カテゴリは近日公開予定です。',
    'zh-Hans': '此设置类别即将推出。',
    'zh-Hant': '此設定類別即將推出。',
    'fr': 'Cette catégorie de paramètres sera bientôt disponible.',
    'ar': 'ستتوفر فئة الإعدادات هذه قريبًا.',
    'de': 'Diese Einstellungskategorie kommt bald.',
    'es': 'Esta categoría de ajustes estará disponible próximamente.',
    'id': 'Kategori pengaturan ini akan segera hadir.',
    'it': 'Questa categoria di impostazioni sarà disponibile presto.',
    'ko': '이 설정 카테고리는 곧 제공됩니다.',
    'nl': 'Deze instellingencategorie komt binnenkort.',
    'pl': 'Ta kategoria ustawień pojawi się wkrótce.',
    'pt': 'Esta categoria de configurações estará disponível em breve.',
    'ru': 'Эта категория настроек скоро появится.',
    'th': 'หมวดหมู่การตั้งค่านี้จะพร้อมใช้งานเร็วๆ นี้',
    'tr': 'Bu ayar kategorisi yakında kullanıma sunulacak.',
    'vi': 'Danh mục cài đặt này sẽ sớm ra mắt.',
  },
  'pageUnavailable': {
    'ja': 'このページは翻訳できません。',
    'zh-Hans': '此页面无法翻译。',
    'zh-Hant': '此頁面無法翻譯。',
    'fr': 'Cette page ne peut pas être traduite.',
    'ar': 'هذه الصفحة غير متاحة للترجمة.',
    'de': 'Diese Seite ist für die Übersetzung nicht verfügbar.',
    'es': 'Esta página no está disponible para traducir.',
    'id': 'Halaman ini tidak tersedia untuk diterjemahkan.',
    'it': 'Questa pagina non è disponibile per la traduzione.',
    'ko': '이 페이지는 번역할 수 없습니다.',
    'nl': 'Deze pagina is niet beschikbaar voor vertaling.',
    'pl': 'Ta strona jest niedostępna do tłumaczenia.',
    'pt': 'Esta página não está disponível para tradução.',
    'ru': 'Эта страница недоступна для перевода.',
    'th': 'หน้านี้ไม่พร้อมให้แปล',
    'tr': 'Bu sayfa çeviri için kullanılamıyor.',
    'vi': 'Không thể dịch trang này.',
  },
  'noReadableContent': {
    'ja': '読み取れるコンテンツが見つかりません',
    'zh-Hans': '未找到可读取的内容',
    'zh-Hant': '找不到可讀取的內容',
    'fr': 'Aucun contenu lisible trouvé',
    'ar': 'لم يتم العثور على محتوى قابل للقراءة',
    'de': 'Keine lesbaren Inhalte gefunden',
    'es': 'No se encontró contenido legible',
    'id': 'Tidak ada konten yang dapat dibaca',
    'it': 'Nessun contenuto leggibile trovato',
    'ko': '읽을 수 있는 콘텐츠를 찾을 수 없습니다',
    'nl': 'Geen leesbare inhoud gevonden',
    'pl': 'Nie znaleziono czytelnej treści',
    'pt': 'Nenhum conteúdo legível encontrado',
    'ru': 'Читаемый контент не найден',
    'th': 'ไม่พบเนื้อหาที่อ่านได้',
    'tr': 'Okunabilir içerik bulunamadı',
    'vi': 'Không tìm thấy nội dung có thể đọc',
  },
  'detectingSubtitles': {
    'ja': '字幕を検出しています',
    'zh-Hans': '正在检测字幕',
    'zh-Hant': '正在偵測字幕',
    'fr': 'Détection des sous-titres',
    'ar': 'جارٍ اكتشاف الترجمات',
    'de': 'Untertitel werden erkannt',
    'es': 'Detectando subtítulos',
    'id': 'Mendeteksi subtitle',
    'it': 'Rilevamento dei sottotitoli',
    'ko': '자막 감지 중',
    'nl': 'Ondertitels detecteren',
    'pl': 'Wykrywanie napisów',
    'pt': 'Detetando legendas',
    'ru': 'Поиск субтитров',
    'th': 'กำลังตรวจหาคำบรรยาย',
    'tr': 'Altyazılar algılanıyor',
    'vi': 'Đang phát hiện phụ đề',
  },
  'noSubtitlesFound': {
    'ja': '字幕が見つかりません',
    'zh-Hans': '未找到字幕',
    'zh-Hant': '找不到字幕',
    'fr': 'Aucun sous-titre trouvé',
    'ar': 'لم يتم العثور على ترجمات',
    'de': 'Keine Untertitel gefunden',
    'es': 'No se encontraron subtítulos',
    'id': 'Subtitle tidak ditemukan',
    'it': 'Nessun sottotitolo trovato',
    'ko': '자막을 찾을 수 없습니다',
    'nl': 'Geen ondertitels gevonden',
    'pl': 'Nie znaleziono napisów',
    'pt': 'Nenhuma legenda encontrada',
    'ru': 'Субтитры не найдены',
    'th': 'ไม่พบคำบรรยาย',
    'tr': 'Altyazı bulunamadı',
    'vi': 'Không tìm thấy phụ đề',
  },
  'pageTranslation': {
    'ja': 'ページ翻訳',
    'zh-Hans': '页面翻译',
    'zh-Hant': '頁面翻譯',
    'fr': 'Traduction de la page',
    'ar': 'ترجمة الصفحة',
    'de': 'Seitenübersetzung',
    'es': 'Traducción de página',
    'id': 'Terjemahan halaman',
    'it': 'Traduzione della pagina',
    'ko': '페이지 번역',
    'nl': 'Paginavertaling',
    'pl': 'Tłumaczenie strony',
    'pt': 'Tradução da página',
    'ru': 'Перевод страницы',
    'th': 'แปลหน้าเว็บ',
    'tr': 'Sayfa çevirisi',
    'vi': 'Dịch trang',
  },
  'startPlaying': {
    'ja': '動画を再生してください。',
    'zh-Hans': '开始播放视频。',
    'zh-Hant': '開始播放影片。',
    'fr': 'Lancez une vidéo.',
     'ar': 'ابدأ تشغيل فيديو.', 
    'de': 'Starte die Wiedergabe eines Videos.',  'es': 'Comienza a reproducir un video.',
      
      'id': 'Mulai putar video.',
    'it': 'Avvia la riproduzione di un video.', 'ko': '동영상을 재생하세요.', 'nl': 'Start een video met afspelen.',
     'pl': 'Rozpocznij odtwarzanie filmu.', 'pt': 'Comece a reproduzir um vídeo.',
     'ru': 'Начните воспроизведение видео.', 
      'th': 'เริ่มเล่นวิดีโอ',
    'tr': 'Bir video oynatmaya başlayın.', 'vi': 'Bắt đầu phát video.',
  },
  'failedToLoadSubtitles': {
    'ja': '字幕の読み込みに失敗しました',
    'zh-Hans': '字幕加载失败',
    'zh-Hant': '字幕載入失敗',
    'fr': 'Échec du chargement des sous-titres',
     'ar': 'فشل تحميل الترجمة',
     'de': 'Fehler beim Laden der Untertitel',
     'es': 'Error al cargar los subtítulos',
     
     
     'id': 'Gagal memuat subtitle',
    'it': 'Impossibile caricare i sottotitoli', 'ko': '자막을 불러오지 못했습니다',
    'nl': 'Kan ondertitels niet laden', 
    'pl': 'Nie udało się załadować napisów', 'pt': 'Falha ao carregar legendas',
     'ru': 'Не удалось загрузить субтитры',
     
     'th': 'โหลดคำบรรยายไม่สำเร็จ',
    'tr': 'Altyazılar yüklenemedi', 'vi': 'Không thể tải phụ đề',
  },
  'showTranscript': {
    'ja': 'トランスクリプトを表示',
    'zh-Hans': '显示字幕',
    'zh-Hant': '顯示字幕',
    'fr': 'Afficher la transcription',
     'ar': 'إظهار النص', 
    'de': 'Transkript anzeigen',  'es': 'Mostrar transcripción',
      
      'id': 'Tampilkan Transkrip',
    'it': 'Mostra trascrizione', 'ko': '스크립트 보기', 'nl': 'Transcriptie tonen',
     'pl': 'Pokaż transkrypcję', 'pt': 'Mostrar transcrição',
     'ru': 'Показать транскрипт', 
      'th': 'แสดงบทถอดความ',
    'tr': 'Transkripti Göster', 'vi': 'Hiện bản ghi',
  },
  'extensionDescription': {
    'ja': 'お気に入りのストリーミングサイトで、対話式の二か国語字幕と即時辞書検索で言語を学べます。',
    'zh-Hans': '在你喜欢的流媒体网站上，用互动双语字幕和即时词典查询学习语言。',
    'zh-Hant': '在你喜愛的串流媒體網站上，用互動雙語字幕和即時字典查詢學習語言。',
    'fr': 'Sous-titres bilingues interactifs et dictionnaire instantané pour apprendre une langue sur vos sites de streaming préférés.',
    'ar': 'ترجمات ثنائية تفاعلية وبحث فوري في القاموس لتعلّم اللغات على مواقع البث المفضلة لديك.',
    'de': 'Interaktive zweisprachige Untertitel und sofortige Wörterbuch-Suchen zum Sprachenlernen auf deinen bevorzugten Streaming-Seiten.',
    'es': 'Subtítulos bilingües interactivos y diccionario instantáneo para aprender idiomas en tus sitios de streaming favoritos.',
    'id': 'Subtitle ganda interaktif dan pencarian kamus instan untuk belajar bahasa di situs streaming favorit Anda.',
    'it': 'Sottotitoli bilingue interattivi e ricerche istantanee nel dizionario per imparare le lingue sui tuoi siti di streaming preferiti.',
    'ko': '즐겨찾는 스트리밍 사이트에서 대화형 이중 자막과 즉시 사전 검색으로 언어를 배우세요.',
    'nl': 'Interactieve tweetalige ondertitels en directe woordenboekopzoekingen om talen te leren op je favoriete streamingwebsites.',
    'pl': 'Interaktywne dwujęzyczne napisy i natychmiastowy słownik do nauki języków na Twoich ulubionych stronach streamingowych.',
    'pt': 'Legendas bilíngues interativas e consultas instantâneas ao dicionário para aprender idiomas nos seus sites de streaming favoritos.',
    'ru': 'Интерактивные двуязычные субтитры и мгновенный поиск по словарю для изучения языков на ваших любимых стриминговых сайтах.',
    'th': 'คำบรรยายคู่แบบโต้ตอบและการค้นหาพจนานุกรมทันทีสำหรับการเรียนรู้ภาษาบนเว็บไซต์สตรีมมิ่งที่คุณชื่นชอบ',
    'tr': 'En sevdiğiniz yayın sitelerinde etkileşimli çift altyazı ve anında sözlük aramasıyla dil öğrenin.',
    'vi': 'Phụ đề song ngữ tương tác và tra từ điển tức thì để học ngôn ngữ trên các trang phát trực tuyến yêu thích của bạn.',
  },
  'popupLoginPrompt': {
    'ja': 'ログインして単語を保存し、Language Playerと同期しましょう。',
    'zh-Hans': '登录以保存单词并与 Language Player 同步。',
    'zh-Hant': '登入以儲存單字並與 Language Player 同步。',
    'fr': 'Connectez-vous pour enregistrer des mots et synchroniser avec Language Player.',
    
    'ar': 'سجل الدخول لحفظ الكلمات والمزامنة مع Language Player.',
    
    'de': 'Melde dich an, um Wörter zu speichern und mit Language Player zu synchronisieren.',
    
    'es': 'Inicia sesión para guardar palabras y sincronizar con Language Player.',
    
    
    
    
    
    'id': 'Masuk untuk menyimpan kata dan menyinkronkan dengan Language Player.',
    'it': 'Accedi per salvare le parole e sincronizzarle con Language Player.',
    'ko': '로그인하여 단어를 저장하고 Language Player와 동기화하세요.',
    'nl': 'Log in om woorden op te slaan en te synchroniseren met Language Player.',
    
    'pl': 'Zaloguj się, aby zapisywać słowa i synchronizować z Language Player.',
    'pt': 'Faça login para salvar palavras e sincronizar com o Language Player.',
    
    'ru': 'Войдите, чтобы сохранять слова и синхронизировать с Language Player.',
    
    
    
    'th': 'เข้าสู่ระบบเพื่อบันทึกคำศัพท์และซิงค์กับ Language Player',
    'tr': 'Kelimeleri kaydetmek ve Language Player ile senkronize etmek için giriş yapın.',
    'vi': 'Đăng nhập để lưu từ và đồng bộ với Language Player.',
  },
  'popupShowTranscript': {
    'ja': 'トランスクリプトを表示',
    'zh-Hans': '显示字幕',
    'zh-Hant': '顯示字幕',
    'fr': 'Afficher la transcription',
     'ar': 'إظهار النص', 
    'de': 'Transkript anzeigen',  'es': 'Mostrar transcripción',
      
      'id': 'Tampilkan Transkrip',
    'it': 'Mostra trascrizione', 'ko': '스크립트 보기', 'nl': 'Transcriptie tonen',
     'pl': 'Pokaż transkrypcję', 'pt': 'Mostrar transcrição',
     'ru': 'Показать транскрипт', 
      'th': 'แสดงบทถอดความ',
    'tr': 'Transkripti Göster', 'vi': 'Hiện bản ghi',
  },
  'popupInstructions': {
    'ja': '<strong>Prime Video</strong>、<strong>YouTube</strong>、<strong>Netflix</strong>で動画を再生してください。字幕が見つかるとトランスクリプトパネルが自動的に開きます。',
    'zh-Hans': '在 <strong>Prime Video</strong>、<strong>YouTube</strong> 或 <strong>Netflix</strong> 上播放任意视频。字幕面板将在检测到字幕后自动打开。',
    'zh-Hant': '在 <strong>Prime Video</strong>、<strong>YouTube</strong> 或 <strong>Netflix</strong> 上播放任意影片。字幕面板將在檢測到字幕後自動開啟。',
    'fr': 'Lancez une vidéo sur <strong>Prime Video</strong>, <strong>YouTube</strong> ou <strong>Netflix</strong>. Le panneau de transcription s\'ouvre automatiquement.',
    
    'ar': 'ابدأ تشغيل أي فيديو على <strong>Prime Video</strong> أو <strong>YouTube</strong> أو <strong>Netflix</strong>. تفتح لوحة النص تلقائيًا عند العثور على ترجمات.',
    
    'de': 'Starte ein beliebiges Video auf <strong>Prime Video</strong>, <strong>YouTube</strong> oder <strong>Netflix</strong>. Das Transkript-Panel öffnet sich automatisch, sobald Untertitel gefunden werden.',
    
    'es': 'Reproduce cualquier video en <strong>Prime Video</strong>, <strong>YouTube</strong> o <strong>Netflix</strong>. El panel de transcripción se abre automáticamente cuando se encuentran subtítulos.',
    
    
    
    
    
    'id': 'Mulai putar video apa pun di <strong>Prime Video</strong>, <strong>YouTube</strong>, atau <strong>Netflix</strong>. Panel transkrip terbuka secara otomatis saat subtitle ditemukan.',
    'it': 'Avvia la riproduzione di qualsiasi video su <strong>Prime Video</strong>, <strong>YouTube</strong> o <strong>Netflix</strong>. Il pannello di trascrizione si apre automaticamente quando vengono trovati i sottotitoli.',
    'ko': '<strong>Prime Video</strong>, <strong>YouTube</strong>, <strong>Netflix</strong>에서 동영상을 재생하세요. 자막이 발견되면 스크립트 패널이 자동으로 열립니다.',
    'nl': 'Start een video op <strong>Prime Video</strong>, <strong>YouTube</strong> of <strong>Netflix</strong>. Het transcriptiepaneel opent automatisch zodra ondertitels worden gevonden.',
    
    'pl': 'Rozpocznij odtwarzanie dowolnego filmu na <strong>Prime Video</strong>, <strong>YouTube</strong> lub <strong>Netflix</strong>. Panel transkrypcji otwiera się automatycznie po znalezieniu napisów.',
    'pt': 'Comece a reproduzir qualquer vídeo no <strong>Prime Video</strong>, <strong>YouTube</strong> ou <strong>Netflix</strong>. O painel de transcrição abre automaticamente quando as legendas são encontradas.',
    
    'ru': 'Начните воспроизведение любого видео на <strong>Prime Video</strong>, <strong>YouTube</strong> или <strong>Netflix</strong>. Панель транскрипта открывается автоматически при обнаружении субтитров.',
    
    
    
    'th': 'เริ่มเล่นวิดีโอบน <strong>Prime Video</strong>, <strong>YouTube</strong> หรือ <strong>Netflix</strong> แผงบทถอดความจะเปิดโดยอัตโนมัติเมื่อพบคำบรรยาย',
    'tr': '<strong>Prime Video</strong>, <strong>YouTube</strong> veya <strong>Netflix</strong>\'te herhangi bir videoyu oynatmaya başlayın. Altyazı bulunduğunda transkript paneli otomatik olarak açılır.',
    'vi': 'Bắt đầu phát bất kỳ video nào trên <strong>Prime Video</strong>, <strong>YouTube</strong> hoặc <strong>Netflix</strong>. Bảng bản ghi sẽ tự động mở khi tìm thấy phụ đề.',
  },
  'popupClickWord': {
    'ja': '単語を<strong>クリック</strong>すると辞書で調べられます',
    'zh-Hans': '<strong>点击</strong>任意单词即可查词典',
    'zh-Hant': '<strong>點擊</strong>任意單字即可查詞典',
    'fr': '<strong>Cliquez</strong> sur un mot pour le rechercher dans le dictionnaire',
    
    'ar': '<strong>انقر</strong> على أي كلمة للبحث عنها في القاموس',
    
    'de': '<strong>Klicke</strong> auf ein beliebiges Wort, um es im Wörterbuch nachzuschlagen',
    
    'es': 'Haz <strong>clic</strong> en cualquier palabra para buscarla en el diccionario',
    
    
    
    
    
    'id': '<strong>Klik</strong> kata apa pun untuk mencarinya di kamus',
    'it': 'Fai <strong>clic</strong> su qualsiasi parola per cercarla nel dizionario',
    'ko': '단어를 <strong>클릭</strong>하여 사전에서 찾아보세요',
    'nl': '<strong>Klik</strong> op een willekeurig woord om het op te zoeken in het woordenboek',
    
    'pl': '<strong>Kliknij</strong> dowolne słowo, aby sprawdzić je w słowniku',
    'pt': '<strong>Clique</strong> em qualquer palavra para consultá-la no dicionário',
    
    'ru': '<strong>Нажмите</strong> на любое слово, чтобы посмотреть его в словаре',
    
    
    
    'th': '<strong>คลิก</strong> คำใดก็ได้เพื่อค้นหาในพจนานุกรม',
    'tr': 'Sözlükte aramak için herhangi bir kelimeye <strong>tıklayın</strong>',
    'vi': '<strong>Nhấp</strong> vào bất kỳ từ nào để tra từ điển',
  },
  'popupSaveWords': {
    'ja': 'Language Playerアカウントに単語を<strong>保存</strong>',
    'zh-Hans': '<strong>收藏</strong>单词到您的 Language Player 账户',
    'zh-Hant': '<strong>收藏</strong>單字到您的 Language Player 帳戶',
    'fr': '<strong>Enregistrez</strong> des mots sur votre compte Language Player',
    
    'ar': '<strong>احفظ</strong> الكلمات في حساب Language Player الخاص بك',
    
    'de': '<strong>Speichere</strong> Wörter in deinem Language Player-Konto',
    
    'es': '<strong>Guarda</strong> palabras en tu cuenta de Language Player',
    
    
    
    
    
    'id': '<strong>Simpan</strong> kata ke akun Language Player Anda',
    'it': '<strong>Salva</strong> le parole sul tuo account Language Player',
    'ko': 'Language Player 계정에 단어를 <strong>저장</strong>하세요',
    'nl': '<strong>Sla</strong> woorden op in je Language Player-account',
    
    'pl': '<strong>Zapisuj</strong> słowa na swoim koncie Language Player',
    'pt': '<strong>Salve</strong> palavras na sua conta do Language Player',
    
    'ru': '<strong>Сохраняйте</strong> слова в свой аккаунт Language Player',
    
    
    
    'th': '<strong>บันทึก</strong> คำศัพท์ลงในบัญชี Language Player ของคุณ',
    'tr': 'Language Player hesabınıza kelimeleri <strong>kaydedin</strong>',
    'vi': '<strong>Lưu</strong> từ vào tài khoản Language Player của bạn',
  },
  'popupToggleShortcut': {
    'ja': '<kbd>Alt</kbd> + <kbd>T</kbd> でパネルの表示/非表示を切り替え',
    'zh-Hans': '按 <kbd>Alt</kbd> + <kbd>T</kbd> 切换面板',
    'zh-Hant': '按 <kbd>Alt</kbd> + <kbd>T</kbd> 切換面板',
    'fr': 'Appuyez sur <kbd>Alt</kbd> + <kbd>T</kbd> pour afficher le panneau',
    
    'ar': 'اضغط على <kbd>Alt</kbd> + <kbd>T</kbd> لتبديل اللوحة',
    
    'de': 'Drücke <kbd>Alt</kbd> + <kbd>T</kbd> zum Ein-/Ausblenden des Panels',
    
    'es': 'Pulsa <kbd>Alt</kbd> + <kbd>T</kbd> para mostrar/ocultar el panel',
    
    
    
    
    
    'id': 'Tekan <kbd>Alt</kbd> + <kbd>T</kbd> untuk menampilkan/menyembunyikan panel',
    'it': 'Premi <kbd>Alt</kbd> + <kbd>T</kbd> per mostrare/nascondere il pannello',
    'ko': '<kbd>Alt</kbd> + <kbd>T</kbd>를 눌러 패널을 표시/숨깁니다',
    'nl': 'Druk op <kbd>Alt</kbd> + <kbd>T</kbd> om het paneel te tonen/verbergen',
    
    'pl': 'Naciśnij <kbd>Alt</kbd> + <kbd>T</kbd>, aby przełączyć panel',
    'pt': 'Pressione <kbd>Alt</kbd> + <kbd>T</kbd> para mostrar/ocultar o painel',
    
    'ru': 'Нажмите <kbd>Alt</kbd> + <kbd>T</kbd> для переключения панели',
    
    
    
    'th': 'กด <kbd>Alt</kbd> + <kbd>T</kbd> เพื่อสลับแผง',
    'tr': 'Paneli açıp kapatmak için <kbd>Alt</kbd> + <kbd>T</kbd> tuşlarına basın',
    'vi': 'Nhấn <kbd>Alt</kbd> + <kbd>T</kbd> để bật/tắt bảng điều khiển',
  },
  'popupCaptionsHint': {
    'ja': '💡 学習中の言語で<strong>字幕がオン</strong>になっていることを確認してください。',
    'zh-Hans': '💡 请确保您学习语言的<strong>字幕已开启</strong>。',
    'zh-Hant': '💡 請確保您學習語言的<strong>字幕已開啟</strong>。',
    'fr': '💡 Assurez-vous que <strong>les sous-titres sont activés</strong> dans la langue que vous étudiez.',
    
    'ar': '💡 تأكد من <strong>تشغيل الترجمة</strong> باللغة التي تدرسها.',
    
    'de': '💡 Stelle sicher, dass <strong>Untertitel eingeschaltet sind</strong> in der Sprache, die du lernst.',
    
    'es': '💡 Asegúrate de que <strong>los subtítulos estén activados</strong> en el idioma que estudias.',
    
    
    
    
    
    'id': '💡 Pastikan <strong>subtitle diaktifkan</strong> dalam bahasa yang Anda pelajari.',
    'it': '💡 Assicurati che <strong>i sottotitoli siano attivati</strong> nella lingua che stai studiando.',
    'ko': '💡 공부 중인 언어로 <strong>자막이 켜져 있는지</strong> 확인하세요.',
    'nl': '💡 Zorg ervoor dat <strong>ondertitels zijn ingeschakeld</strong> in de taal die je studeert.',
    
    'pl': '💡 Upewnij się, że <strong>napisy są włączone</strong> w języku, którego się uczysz.',
    'pt': '💡 Certifique-se de que <strong>as legendas estão ativadas</strong> no idioma que você estuda.',
    
    'ru': '💡 Убедитесь, что <strong>субтитры включены</strong> на изучаемом языке.',
    
    
    
    'th': '💡 ตรวจสอบว่า<strong>เปิดคำบรรยาย</strong>ในภาษาที่คุณกำลังเรียนอยู่',
    'tr': '💡 Çalıştığınız dilde <strong>altyazıların açık olduğundan</strong> emin olun.',
    'vi': '💡 Đảm bảo <strong>phụ đề được bật</strong> bằng ngôn ngữ bạn đang học.',
  },
  'explainPro': {
    'zh-Hans': '让 DeepSeek 解释（专业版）',
    'zh-Hant': '讓 DeepSeek 解釋（專業版）',
    
    'ar': 'دع DeepSeek يشرح (Pro)',
    
    'de': 'Von DeepSeek erklären lassen (Pro)',
    
    'es': 'Deja que DeepSeek lo explique (Pro)',
    
    'fr': 'Laisser DeepSeek expliquer (Pro)',
    
    
    
    
    'id': 'Biarkan DeepSeek Menjelaskan (Pro)',
    'it': 'Lascia spiegare a DeepSeek (Pro)',
    'ja': 'DeepSeekに説明させる（プロ）',
    'ko': 'DeepSeek에게 설명 요청 (Pro)',
    'nl': 'Laat DeepSeek het uitleggen (Pro)',
    
    'pl': 'Pozwól DeepSeek wyjaśnić (Pro)',
    'pt': 'Deixe o DeepSeek Explicar (Pro)',
    
    'ru': 'Пусть DeepSeek объяснит (Pro)',
    
    
    
    'th': 'ให้ DeepSeek อธิบาย (Pro)',
    'tr': 'DeepSeek Açıklasın (Pro)',
    'vi': 'Để DeepSeek giải thích (Pro)',
  },
  'lookingUpWord': {
    'zh-Hans': '正在查找 {word}…',
    'zh-Hant': '正在查找 {word}…',
    
    'ar': 'البحث عن {word}…',
    
    'de': 'Suche {word}…',
    
    'es': 'Buscando {word}…',
    
    'fr': 'Recherche de {word}…',
    
    
    
    
    'id': 'Mencari {word}…',
    'it': 'Cercando {word}…',
    'ja': '{word}を検索中…',
    'ko': '{word} 찾는 중…',
    'nl': '{word} opzoeken…',
    
    'pl': 'Szukanie {word}…',
    'pt': 'Procurando {word}…',
    
    'ru': 'Поиск {word}…',
    
    
    
    'th': 'กำลังค้นหา {word}…',
    'tr': '{word} aranıyor…',
    'vi': 'Đang tra {word}…',
  },
  'l2Mismatch': {
    'zh-Hans': '您在视频播放器中选择的字幕是{detectedLang}，但您在Language Player中的目标语言（L2）设置为{savedLang}。',
    'zh-Hant': '您在影片播放器中選擇的字幕是{detectedLang}，但您在Language Player中的目標語言（L2）設置為{savedLang}。',
    
    'ar': 'الترجمة التي حددتها من مشغل الفيديو باللغة {detectedLang}، ولكن لغتك المستهدفة (L2) في Language Player مضبوطة على {savedLang}.',
    
    'de': 'Die von Ihnen im Videoplayer ausgewählten Untertitel sind auf {detectedLang}, aber Ihre Zielsprache (L2) in Language Player ist auf {savedLang} eingestellt.',
    
    'es': 'Los subtítulos que seleccionaste en el reproductor de video están en {detectedLang}, pero tu idioma de aprendizaje (L2) en Language Player está configurado como {savedLang}.',
    
    'fr': 'Les sous-titres que vous avez sélectionnés dans le lecteur vidéo sont en {detectedLang}, mais votre langue cible (L2) dans Language Player est définie sur {savedLang}.',
    
    
    
    
    'id': 'Subtitle yang Anda pilih dari pemutar video dalam bahasa {detectedLang}, tetapi bahasa target Anda (L2) di Language Player diatur ke {savedLang}.',
    'it': 'I sottotitoli che hai selezionato nel lettore video sono in {detectedLang}, ma la tua lingua di destinazione (L2) in Language Player è impostata su {savedLang}.',
    'ja': '動画プレーヤーで選択した字幕は{detectedLang}ですが、Language Playerの学習言語（L2）は{savedLang}に設定されています。',
    'ko': '비디오 플레이어에서 선택한 자막은 {detectedLang}이지만 Language Player의 학습 언어(L2)는 {savedLang}(으)로 설정되어 있습니다.',
    'nl': 'De ondertitels die u in de videospeler hebt geselecteerd, zijn in het {detectedLang}, maar uw doeltaal (L2) in Language Player is ingesteld op {savedLang}.',
    
    'pl': 'Napisy wybrane w odtwarzaczu wideo są w języku {detectedLang}, ale Twój język docelowy (L2) w Language Player jest ustawiony na {savedLang}.',
    'pt': 'As legendas que você selecionou no player de vídeo estão em {detectedLang}, mas seu idioma alvo (L2) no Language Player está definido como {savedLang}.',
    
    'ru': 'Субтитры, которые вы выбрали в видеоплеере, на {detectedLang}, но ваш целевой язык (L2) в Language Player установлен на {savedLang}.',
    
    
    
    'th': 'คำบรรยายที่คุณเลือกจากเครื่องเล่นวิดีโอเป็นภาษา{detectedLang} แต่ภาษาเป้าหมาย (L2) ของคุณใน Language Player ถูกตั้งค่าเป็น{savedLang}',
    'tr': 'Video oynatıcıdan seçtiğiniz altyazılar {detectedLang} dilinde, ancak Language Player\'daki hedef diliniz (L2) {savedLang} olarak ayarlanmış.',
    'vi': 'Phụ đề bạn đã chọn từ trình phát video bằng {detectedLang}, nhưng ngôn ngữ đích (L2) của bạn trong Language Player được đặt thành {savedLang}.',
  },
  'l2MismatchSwitch': {
    'zh-Hans': '将我的L2设置为{detectedLang}',
    'zh-Hant': '將我的L2設置為{detectedLang}',
    
    'ar': 'تعيين لغتي الثانية إلى {detectedLang}',
    
    'de': 'Mein L2 auf {detectedLang} setzen',
    
    'es': 'Establecer mi L2 a {detectedLang}',
    
    'fr': 'Définir ma L2 sur {detectedLang}',
    
    
    
    
    'id': 'Atur L2 saya ke {detectedLang}',
    'it': 'Imposta la mia L2 su {detectedLang}',
    'ja': 'L2を{detectedLang}に設定する',
    'ko': '내 L2를 {detectedLang}(으)로 설정',
    'nl': 'Mijn L2 instellen op {detectedLang}',
    
    'pl': 'Ustaw mój L2 na {detectedLang}',
    'pt': 'Definir meu L2 como {detectedLang}',
    
    'ru': 'Установить мой L2 на {detectedLang}',
    
    
    
    'th': 'ตั้งค่า L2 ของฉันเป็น{detectedLang}',
    'tr': 'L2\'imi {detectedLang} olarak ayarla',
    'vi': 'Đặt L2 của tôi thành {detectedLang}',
  },
  'language': {
    'ja': '言語',
    'zh-Hans': '语言',
    'zh-Hant': '語言',
    'fr': 'Langue',
     'ar': 'اللغة', 
    'de': 'Sprache',  'es': 'Idioma',
      
      'id': 'Bahasa',
    'it': 'Lingua', 'ko': '언어', 'nl': 'Taal',
     'pl': 'Język', 'pt': 'Idioma',
     'ru': 'Язык', 
      'th': 'ภาษา',
    'tr': 'Dil', 'vi': 'Ngôn ngữ',
  },
  'showPhonetics': {
    'ja': 'ふりがなを表示',
    'zh-Hans': '显示拼音',
    'zh-Hant': '顯示拼音',
    'fr': 'Afficher la phonétique',
     'ar': 'إظهار الصوتيات',
     'de': 'Phonetik anzeigen',
     'es': 'Mostrar fonética',
     
     
     'id': 'Tampilkan fonetik',
    'it': 'Mostra fonetica', 'ko': '발음 표시',
    'nl': 'Toon fonetiek', 
    'pl': 'Pokaż fonetykę', 'pt': 'Mostrar fonética',
     'ru': 'Показать фонетику',
     
     'th': 'แสดงสัทอักษร',
    'tr': 'Fonetiği göster', 'vi': 'Hiển thị ngữ âm',
  },
  'openInLanguagePlayer': {
    'ja': 'Language Player で開く',
    'zh-Hans': '在 Language Player 中打开',
    'zh-Hant': '在 Language Player 中開啟',
    'fr': 'Ouvrir dans Language Player',
     'ar': 'فتح في Language Player',
     'de': 'In Language Player öffnen',
     'es': 'Abrir en Language Player',
     
     
     'id': 'Buka di Language Player',
    'it': 'Apri in Language Player', 'ko': 'Language Player에서 열기',
    'nl': 'Openen in Language Player', 
    'pl': 'Otwórz w Language Player', 'pt': 'Abrir no Language Player',
     'ru': 'Открыть в Language Player',
     
     'th': 'เปิดใน Language Player',
    'tr': 'Language Player\'de aç', 'vi': 'Mở trong Language Player',
  },
  'hideTranscript': {
    'ja': 'トランスクリプトを非表示',
    'zh-Hans': '隐藏字幕',
    'zh-Hant': '隱藏字幕',
    'fr': 'Masquer la transcription',
     'ar': 'إخفاء النص',
     'de': 'Transkript ausblenden',
     'es': 'Ocultar transcripción',
     
     
     'id': 'Sembunyikan Transkrip',
    'it': 'Nascondi trascrizione', 'ko': '스크립트 숨기기',
    'nl': 'Transcriptie verbergen', 
    'pl': 'Ukryj transkrypcję', 'pt': 'Ocultar transcrição',
     'ru': 'Скрыть транскрипт',
     
     'th': 'ซ่อนบทถอดความ',
    'tr': 'Transkripti Gizle', 'vi': 'Ẩn bản ghi',
  },
  'watchInLanguagePlayer': {
    'ja': 'Language Player で視聴',
    'zh-Hans': '在 Language Player 中观看',
    'zh-Hant': '在 Language Player 中觀看',
    'fr': 'Regarder dans Language Player',
     'ar': 'شاهد في Language Player',
     'de': 'In Language Player ansehen',
     'es': 'Ver en Language Player',
     
     
     'id': 'Tonton di Language Player',
    'it': 'Guarda in Language Player', 'ko': 'Language Player에서 시청',
    'nl': 'Bekijken in Language Player', 
    'pl': 'Oglądaj w Language Player', 'pt': 'Assistir no Language Player',
     'ru': 'Смотреть в Language Player',
     
     'th': 'รับชมใน Language Player',
    'tr': 'Language Player\'de izle', 'vi': 'Xem trong Language Player',
  },
  'readInLanguagePlayer': {
    'ja': 'Language Player で読む',
    'zh-Hans': '在 Language Player 中阅读',
    'zh-Hant': '在 Language Player 中閱讀',
    'fr': 'Lire dans Language Player',
     'ar': 'اقرأ في Language Player',
     'de': 'In Language Player lesen',
     'es': 'Leer en Language Player',
     
     
     'id': 'Baca di Language Player',
    'it': 'Leggi in Language Player', 'ko': 'Language Player에서 읽기',
    'nl': 'Lezen in Language Player', 
    'pl': 'Czytaj w Language Player', 'pt': 'Ler no Language Player',
     'ru': 'Читать в Language Player',
     
     'th': 'อ่านใน Language Player',
    'tr': 'Language Player\'de oku', 'vi': 'Đọc trong Language Player',
  },
  'makeTextInteractive': {
    'zh-Hans': '让页面文本可交互',
    'zh-Hant': '讓頁面文字可互動',
    'ar': 'اجعل نص الصفحة تفاعليًا',
    'de': 'Seitentext interaktiv machen',
    'es': 'Hacer interactivo el texto de la página',
    'fr': 'Rendre le texte de la page interactif',
    'id': 'Jadikan teks halaman interaktif',
    'it': 'Rendi interattivo il testo della pagina',
    'ja': 'ページのテキストをインタラクティブにする',
    'ko': '페이지 텍스트를 인터랙티브하게',
    'nl': 'Paginatekst interactief maken',
    'pl': 'Uczyń tekst strony interaktywnym',
    'pt': 'Tornar o texto da página interativo',
    'ru': 'Сделать текст страницы интерактивным',
    'th': 'ทำให้ข้อความบนหน้าเว็บโต้ตอบได้',
    'tr': 'Sayfa metnini etkileşimli yap',
    'vi': 'Biến văn bản trang thành tương tác',
  },
  'followLink': {
    'zh-Hans': '打开链接',
    'zh-Hant': '開啟連結',
    'ar': 'فتح الرابط',
    'de': 'Link öffnen',
    'es': 'Abrir enlace',
    'fr': 'Ouvrir le lien',
    'id': 'Buka tautan',
    'it': 'Apri link',
    'ja': 'リンクを開く',
    'ko': '링크 열기',
    'nl': 'Link openen',
    'pl': 'Otwórz link',
    'pt': 'Abrir link',
    'ru': 'Открыть ссылку',
    'th': 'เปิดลิงก์',
    'tr': 'Bağlantıyı aç',
    'vi': 'Mở liên kết',
  },
  'clickPageWord': {
    'zh-Hans': '点击页面上的任意单词即可查词典。',
    'zh-Hant': '點擊頁面上的任意單字即可查詞典。',
    'ar': 'انقر على أي كلمة في الصفحة للبحث عنها في القاموس.',
    'de': 'Klicke auf ein beliebiges Wort auf der Seite, um es nachzuschlagen.',
    'es': 'Haz clic en cualquier palabra de la página para buscarla.',
    'fr': 'Cliquez sur n\'importe quel mot de la page pour le rechercher.',
    'id': 'Klik kata apa pun di halaman untuk mencarinya di kamus.',
    'it': 'Fai clic su qualsiasi parola della pagina per cercarla.',
    'ja': 'ページ上の任意の単語をクリックして調べられます。',
    'ko': '페이지의 아무 단어나 클릭하여 사전에서 찾아보세요.',
    'nl': 'Klik op een willekeurig woord op de pagina om het op te zoeken.',
    'pl': 'Kliknij dowolne słowo na stronie, aby sprawdzić je w słowniku.',
    'pt': 'Clique em qualquer palavra da página para consultá-la.',
    'ru': 'Нажмите на любое слово на странице, чтобы посмотреть его в словаре.',
    'th': 'คลิกคำใดก็ได้บนหน้าเว็บเพื่อค้นหาในพจนานุกรม',
    'tr': 'Sayfadaki herhangi bir kelimeye tıklayarak sözlükte arayın.',
    'vi': 'Nhấp vào bất kỳ từ nào trên trang để tra từ điển.',
  },
  'daysRemaining': {
    'zh-Hans': '剩余 {days} 天', 'zh-Hant': '剩餘 {days} 天', 'ar': 'متبقي {days} يومًا',
    'de': 'Noch {days} Tage', 'es': 'Quedan {days} días', 'fr': 'Il reste {days} jours',
    'id': 'Tersisa {days} hari', 'it': 'Rimangono {days} giorni', 'ja': '残り{days}日',
    'ko': '{days}일 남음', 'nl': 'Nog {days} dagen', 'pl': 'Pozostało {days} dni',
    'pt': 'Restam {days} dias', 'ru': 'Осталось дней: {days}', 'th': 'เหลืออีก {days} วัน',
    'tr': '{days} gün kaldı', 'vi': 'Còn {days} ngày',
  },
  'searchOnLanguagePlayer': {
    'zh-Hans': '在语言学习器中搜索 →', 'zh-Hant': '在語言學習器中搜尋 →', 'ar': 'البحث في Language Player ←',
    'de': 'Auf Language Player suchen →', 'es': 'Buscar en Language Player →', 'fr': 'Rechercher sur Language Player →',
    'id': 'Cari di Language Player →', 'it': 'Cerca su Language Player →', 'ja': '言語プレイヤーで検索 →',
    'ko': 'Language Player에서 검색 →', 'nl': 'Zoeken op Language Player →', 'pl': 'Szukaj w Language Player →',
    'pt': 'Pesquisar no Language Player →', 'ru': 'Искать в Language Player →', 'th': 'ค้นหาใน Language Player →',
    'tr': "Language Player'de ara →", 'vi': 'Tìm trên Language Player →',
  },
  'lookupFailed': {
    'zh-Hans': '查询失败', 'zh-Hant': '查詢失敗', 'ar': 'فشل البحث',
    'de': 'Suche fehlgeschlagen', 'es': 'La búsqueda falló', 'fr': 'La recherche a échoué',
    'id': 'Pencarian gagal', 'it': 'Ricerca non riuscita', 'ja': '検索に失敗しました',
    'ko': '검색 실패', 'nl': 'Zoeken mislukt', 'pl': 'Wyszukiwanie nie powiodło się',
    'pt': 'A pesquisa falhou', 'ru': 'Поиск не удался', 'th': 'การค้นหาล้มเหลว',
    'tr': 'Arama başarısız oldu', 'vi': 'Tra cứu thất bại',
  },
  'explainFailed': {
    'zh-Hans': '解释失败', 'zh-Hant': '解釋失敗', 'ar': 'فشل الشرح',
    'de': 'Erklärung fehlgeschlagen', 'es': 'La explicación falló', 'fr': "L'explication a échoué",
    'id': 'Penjelasan gagal', 'it': 'Spiegazione non riuscita', 'ja': '説明に失敗しました',
    'ko': '설명 실패', 'nl': 'Uitleg mislukt', 'pl': 'Wyjaśnienie nie powiodło się',
    'pt': 'A explicação falhou', 'ru': 'Объяснение не удалось', 'th': 'คำอธิบายล้มเหลว',
    'tr': 'Açıklama başarısız oldu', 'vi': 'Giải thích thất bại',
  },
  'examplesFailed': {
    'zh-Hans': '示例获取失败', 'zh-Hant': '範例取得失敗', 'ar': 'فشل الحصول على الأمثلة',
    'de': 'Beispiele konnten nicht geladen werden', 'es': 'No se pudieron cargar los ejemplos', 'fr': "L'obtention d'exemples a échoué",
    'id': 'Gagal memuat contoh', 'it': 'Impossibile caricare gli esempi', 'ja': '例文の取得に失敗しました',
    'ko': '예시 로드 실패', 'nl': 'Voorbeelden laden mislukt', 'pl': 'Nie udało się załadować przykładów',
    'pt': 'Falha ao carregar exemplos', 'ru': 'Не удалось загрузить примеры', 'th': 'โหลดตัวอย่างไม่สำเร็จ',
    'tr': 'Örnekler yüklenemedi', 'vi': 'Không thể tải ví dụ',
  },
  'followUpFailed': {
    'zh-Hans': '追问失败', 'zh-Hant': '追問失敗', 'ar': 'فشل المتابعة',
    'de': 'Folgeanfrage fehlgeschlagen', 'es': 'La consulta de seguimiento falló', 'fr': 'Le suivi a échoué',
    'id': 'Pertanyaan lanjutan gagal', 'it': "La domanda di approfondimento non è riuscita", 'ja': 'フォローアップに失敗しました',
    'ko': '후속 질문 실패', 'nl': 'Vervolgvraag mislukt', 'pl': 'Pytanie uzupełniające nie powiodło się',
    'pt': 'A pergunta de acompanhamento falhou', 'ru': 'Уточняющий вопрос не удался', 'th': 'คำถามต่อเนื่องล้มเหลว',
    'tr': 'Takip sorusu başarısız oldu', 'vi': 'Câu hỏi tiếp theo thất bại',
  },
  'noSubtitleExamples': {
    'zh-Hans': '未找到字幕示例', 'zh-Hant': '找不到字幕範例', 'ar': 'لم يتم العثور على أمثلة من الترجمة',
    'de': 'Keine Untertitel-Beispiele gefunden', 'es': 'No se encontraron ejemplos de subtítulos', 'fr': 'Aucun exemple de sous-titres trouvé',
    'id': 'Tidak ada contoh subtitle yang ditemukan', 'it': 'Nessun esempio di sottotitolo trovato', 'ja': '字幕の例が見つかりません',
    'ko': '자막 예시를 찾을 수 없습니다', 'nl': 'Geen voorbeelden uit ondertitels gevonden', 'pl': 'Nie znaleziono przykładów z napisów',
    'pt': 'Nenhum exemplo de legendas encontrado', 'ru': 'Примеры из субтитров не найдены', 'th': 'ไม่พบตัวอย่างจากคำบรรยาย',
    'tr': 'Altyazı örneği bulunamadı', 'vi': 'Không tìm thấy ví dụ từ phụ đề',
  },
  'accountOnWebsiteNotice': {
    'zh-Hans': '注册或找回密码请前往 languageplayer.io，完成后返回此处登录。',
    'zh-Hant': '註冊或找回密碼請前往 languageplayer.io，完成後返回此處登入。',
    'ar': 'لإنشاء حساب أو إعادة تعيين كلمة المرور، تفضل بزيارة languageplayer.io ثم عد إلى هنا لتسجيل الدخول.',
    'de': 'Um ein Konto zu erstellen oder dein Passwort zurückzusetzen, besuche languageplayer.io und melde dich dann hier wieder an.',
    'es': 'Para crear una cuenta o restablecer tu contraseña, visita languageplayer.io y vuelve aquí para iniciar sesión.',
    'fr': 'Pour créer un compte ou réinitialiser votre mot de passe, rendez-vous sur languageplayer.io, puis revenez ici pour vous connecter.',
    'id': 'Untuk membuat akun atau mengatur ulang kata sandi, kunjungi languageplayer.io lalu kembali ke sini untuk masuk.',
    'it': 'Per creare un account o reimpostare la password, visita languageplayer.io e poi torna qui per accedere.',
    'ja': 'アカウント作成やパスワード再設定は languageplayer.io で行い、完了したらここに戻ってログインしてください。',
    'ko': '계정을 만들거나 비밀번호를 재설정하려면 languageplayer.io를 방문한 후 여기로 돌아와 로그인하세요.',
    'nl': 'Om een account aan te maken of je wachtwoord opnieuw in te stellen, ga je naar languageplayer.io en kom daarna hier terug om in te loggen.',
    'pl': 'Aby utworzyć konto lub zresetować hasło, odwiedź languageplayer.io, a następnie wróć tutaj, aby się zalogować.',
    'pt': 'Para criar uma conta ou redefinir a senha, visite languageplayer.io e volte aqui para entrar.',
    'ru': 'Чтобы создать аккаунт или сбросить пароль, перейдите на languageplayer.io и вернитесь сюда для входа.',
    'th': 'หากต้องการสร้างบัญชีหรือรีเซ็ตรหัสผ่าน โปรดไปที่ languageplayer.io แล้วกลับมาที่นี่เพื่อเข้าสู่ระบบ',
    'tr': 'Hesap oluşturmak veya şifrenizi sıfırlamak için languageplayer.io adresini ziyaret edin, ardından giriş yapmak için buraya dönün.',
    'vi': 'Để tạo tài khoản hoặc đặt lại mật khẩu, hãy truy cập languageplayer.io rồi quay lại đây để đăng nhập.',
  },
};

// ── CSV Parser ────────────────────────────────────────────────────────────

function loadCSV() {
  const text = fs.readFileSync(CSV_PATH, 'utf-8');
  const result = Papa.parse(text, { header: false, skipEmptyLines: true });
  const header = result.data[0] || [];
  const data = {};
  for (let i = 1; i < result.data.length; i++) {
    const cells = result.data[i];
    const key = cells[0];
    if (!key) continue;
    const entry = {};
    for (let j = 1; j < cells.length && j < header.length; j++) {
      entry[header[j]] = cells[j];
    }
    data[key] = entry;
  }
  return data;
}

// ── Generator ─────────────────────────────────────────────────────────────

/**
 * Extract a single branch value from an ICU MessageFormat `select`.
 * e.g. for `{level, select, 1{Beginner I} 2{Beginner II} ...}` and num=1
 * this returns "Beginner I". Used to flatten the CSV `level.name` ICU select
 * into per-level flat keys (the extension's t()/chrome.i18n can't parse ICU).
 * Branch values contain no nested braces, so a simple `[^{}]*` capture works.
 */
function extractIcuSelectValue(icu, num) {
  if (!icu) return null;
  const re = /(?:^|[\s,{])(\d+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(icu)) !== null) {
    if (Number(m[1]) === num) return m[2].trim();
  }
  return null;
}

function main() {
  const csv = loadCSV();

  // Read English messages as key template
  const enMessages = JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, 'en/messages.json'), 'utf-8')
  );
  const keys = Object.keys(enMessages);

  // Get all CSV column locales that map to Chrome locale dirs
  const targetLocales = Object.values(CSV_TO_CHROME);
  // But skip locales we already have manually: en, zh_CN, zh_TW, fr, ja
  const localesToGenerate = targetLocales;  // Generate ALL 18 locales

  // Build reverse map: Chrome locale → CSV column name
  const chromeToCsv = {};
  for (const [csvCol, chromeCode] of Object.entries(CSV_TO_CHROME)) {
    chromeToCsv[chromeCode] = csvCol;
  }

  for (const chromeLocale of localesToGenerate) {
    const csvCol = chromeToCsv[chromeLocale];
    const result = {};

    for (const key of keys) {
      // Skip appName — keep as "Language Player" in all locales
      if (key === 'appName') {
        result[key] = { message: 'Language Player' };
        continue;
      }

      let translated = null;

      // 1. Try CSV lookup
      const csvKey = CSV_LOOKUP[key];
      if (csvKey && csv[csvKey] && csv[csvKey][csvCol]) {
        let val = csv[csvKey][csvCol].trim();
        // For allLanguages, append the word for "Languages"
        if (key === 'allLanguages' && val) {
          // Use the CSV's `title.vocab` or similar pattern? No — just append.
          // CSV filter.all = "All", we need "All Languages"
          // Use the lang name pattern from CSV to build it
          val = val; // Just use "All" for now — most languages this is fine
        }
        if (val) translated = val;
      }

      // 2. Try manual translation map
      if (!translated && MANUAL[key] && MANUAL[key][csvCol]) {
        translated = MANUAL[key][csvCol];
      }

      // 3. levelNameN — flattened from the CSV `level.name` ICU select for the
      //    current locale. chrome.i18n cannot parse ICU MessageFormat, so the
      //    generator turns "{level, select, 1{Beginner I} ...}" into flat keys.
      if (!translated) {
        const levelMatch = key.match(/^levelName([1-7])$/);
        if (levelMatch) {
          const icu = (csv['level.name'] && csv['level.name'][csvCol]) || null;
          translated = extractIcuSelectValue(icu, Number(levelMatch[1]));
        }
      }

      // 4. For popupShowTranscript, reuse showTranscript
      if (!translated) {
        if (key === 'popupShowTranscript' && result['showTranscript']) {
          translated = result['showTranscript'].message;
        }
      }

      // 5. Final fallback: empty string (will trigger Chrome's default_locale fallback)
      if (!translated) {
        console.warn(`  ⚠ No translation for "${key}" in ${chromeLocale} (${csvCol})`);
        translated = enMessages[key].message; // fallback to English
      }

      // Convert CSV {name} placeholders to Chrome $name$ format
      // e.g., "Loading {lang} subtitles…" → "Loading $lang$ subtitles…"
      translated = translated.replace(/\{(\w+)\}/g, '$$$1$');

      // Build the messages.json entry
      const entry = { message: translated };
      // Preserve placeholders from English template
      if (enMessages[key].placeholders) {
        entry.placeholders = enMessages[key].placeholders;
      }
      result[key] = entry;
    }

    // Write
    const dir = path.join(LOCALES_DIR, chromeLocale);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, 'messages.json');
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`  ✓ ${chromeLocale}/messages.json`);
  }

  console.log(`\nDone — generated ${localesToGenerate.length} locale files`);
}

main();
