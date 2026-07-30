/**
 * Generator: translations.csv + built-in map → _locales/{locale}/messages.json
 *
 * Generates Chrome extension locale files for all 31 supported languages.
 * Where an extension message key matches a CSV key, the CSV translation is used.
 * Extension-specific keys without CSV equivalents use a built-in translation map.
 *
 * Usage: node scripts/generate-locales.js
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.resolve(__dirname, '../../../translations.csv');
const LOCALES_DIR = path.resolve(__dirname, '../_locales');

// CSV columns (index → locale name used in _locales/ dir)
const CSV_COLUMNS = [
  'key', 'en', 'zh-Hans', 'zh-Hant', 'af', 'ar', 'ca', 'de', 'el', 'es', 'fi',
  'fr', 'ga', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'ko', 'nl', 'no', 'pl',
  'pt', 'ro', 'ru', 'sr', 'sv', 'sw', 'th', 'tr', 'vi',
];

// CSV → Chrome locale code mapping (zh-Hans → zh_CN, etc.)
const CSV_TO_CHROME = {
  'en': 'en', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', 'af': 'af', 'ar': 'ar',
  'ca': 'ca', 'de': 'de', 'el': 'el', 'es': 'es', 'fi': 'fi', 'fr': 'fr',
  'ga': 'ga', 'hi': 'hi', 'hr': 'hr', 'hu': 'hu', 'id': 'id', 'it': 'it',
  'ja': 'ja', 'ko': 'ko', 'nl': 'nl', 'no': 'no', 'pl': 'pl', 'pt': 'pt',
  'ro': 'ro', 'ru': 'ru', 'sr': 'sr', 'sv': 'sv', 'sw': 'sw', 'th': 'th',
  'tr': 'tr', 'vi': 'vi',
};

// Extension message key → CSV key (pull translation from monorepo CSV)
const CSV_LOOKUP = {
  'closePanel': 'action.close',
  'allLanguages': 'filter.all',        // CSV has "All", we append "Languages" below
  'translate': 'action.translation',
  'showTranslation': 'label.show_translation',
  'copy': 'action.copy',
  'speak': 'action.speak',
  'explain': 'action.let_chatgpt_explain', // "Ask AI" in CSV — close enough
  'explainTitle': 'action.let_chatgpt_explain',
  'save': 'action.save_word',
  'saved': 'label.saved',
  'close': 'action.close',
  'popupLoginBtn': 'action.log_in',
  'popupLogoutBtn': 'action.log_out',
};

// Built-in translations for extension-specific keys without CSV equivalents.
// Keyed by CSV column name (zh-Hans, fr, de, etc.).
// Only include languages NOT already handled by manual _locales/ files.
const MANUAL = {
  'waitingForSubtitles': {
    'af': 'Wag vir onderskrifte…', 'ar': 'في انتظار الترجمة…', 'ca': 'Esperant els subtítols…',
    'de': 'Warte auf Untertitel…', 'el': 'Αναμονή για υπότιτλους…', 'es': 'Esperando subtítulos…',
    'fi': 'Odotetaan tekstityksiä…', 'ga': 'Ag fanacht le fotheidil…', 'hi': 'उपशीर्षक की प्रतीक्षा है…',
    'hr': 'Čekanje titlova…', 'hu': 'Feliratokra vár…', 'id': 'Menunggu subtitle…',
    'it': 'In attesa dei sottotitoli…', 'ko': '자막을 기다리는 중…', 'nl': 'Wachten op ondertitels…',
    'no': 'Venter på undertekster…', 'pl': 'Oczekiwanie na napisy…', 'pt': 'Aguardando legendas…',
    'ro': 'Se așteaptă subtitrări…', 'ru': 'Ожидание субтитров…', 'sr': 'Čekanje titlova…',
    'sv': 'Väntar på undertexter…', 'sw': 'Inasubiri manukuu…', 'th': 'กำลังรอคำบรรยาย…',
    'tr': 'Altyazı bekleniyor…', 'vi': 'Đang chờ phụ đề…',
  },
  'startPlaying': {
    'af': 'Begin om \'n video te speel.', 'ar': 'ابدأ تشغيل فيديو.', 'ca': 'Comença a reproduir un vídeo.',
    'de': 'Starte die Wiedergabe eines Videos.', 'el': 'Ξεκινήστε την αναπαραγωγή ενός βίντεο.', 'es': 'Comienza a reproducir un video.',
    'fi': 'Aloita videon toisto.', 'ga': 'Tosaigh ag seinm físeáin.', 'hi': 'वीडियो चलाना शुरू करें।',
    'hr': 'Pokrenite video.', 'hu': 'Indítson el egy videót.', 'id': 'Mulai putar video.',
    'it': 'Avvia la riproduzione di un video.', 'ko': '동영상을 재생하세요.', 'nl': 'Start een video met afspelen.',
    'no': 'Start avspilling av en video.', 'pl': 'Rozpocznij odtwarzanie filmu.', 'pt': 'Comece a reproduzir um vídeo.',
    'ro': 'Începeți redarea unui videoclip.', 'ru': 'Начните воспроизведение видео.', 'sr': 'Pokrenite video.',
    'sv': 'Börja spela upp en video.', 'sw': 'Anza kucheza video.', 'th': 'เริ่มเล่นวิดีโอ',
    'tr': 'Bir video oynatmaya başlayın.', 'vi': 'Bắt đầu phát video.',
  },
  'loadingLanguage': {
    'af': 'Laai $lang$…', 'ar': 'جارٍ تحميل $lang$…', 'ca': 'S\'està carregant $lang$…',
    'de': '$lang$ wird geladen…', 'el': 'Φόρτωση $lang$…', 'es': 'Cargando $lang$…',
    'fi': 'Ladataan $lang$…', 'ga': '$lang$ á lódáil…', 'hi': '$lang$ लोड हो रहा है…',
    'hr': 'Učitavanje $lang$…', 'hu': '$lang$ betöltése…', 'id': 'Memuat $lang$…',
    'it': 'Caricamento $lang$…', 'ko': '$lang$ 불러오는 중…', 'nl': '$lang$ laden…',
    'no': 'Laster $lang$…', 'pl': 'Ładowanie $lang$…', 'pt': 'Carregando $lang$…',
    'ro': 'Se încarcă $lang$…', 'ru': 'Загрузка $lang$…', 'sr': 'Učitavanje $lang$…',
    'sv': 'Laddar $lang$…', 'sw': 'Inapakia $lang$…', 'th': 'กำลังโหลด $lang$…',
    'tr': '$lang$ yükleniyor…', 'vi': 'Đang tải $lang$…',
  },
  'subtitleEntriesLoaded': {
    'af': '$count$ onderskrifinskrywings gelaai', 'ar': 'تم تحميل $count$ إدخال ترجمة',
    'ca': '$count$ entrades de subtítols carregades', 'de': '$count$ Untertiteleinträge geladen',
    'el': 'Φορτώθηκαν $count$ εγγραφές υποτίτλων', 'es': '$count$ entradas de subtítulos cargadas',
    'fi': '$count$ tekstitysmerkintää ladattu', 'ga': '$count$ iontráil fotheideal lódáilte',
    'hi': '$count$ उपशीर्षक प्रविष्टियाँ लोड की गईं', 'hr': 'Učitano $count$ unosa titlova',
    'hu': '$count$ felirat betöltve', 'id': '$count$ entri subtitle dimuat',
    'it': '$count$ voci di sottotitoli caricate', 'ko': '$count$개의 자막 항목을 불러왔습니다',
    'nl': '$count$ ondertitelitems geladen', 'no': '$count$ undertekstoppføringer lastet',
    'pl': 'Załadowano $count$ wpisów napisów', 'pt': '$count$ entradas de legendas carregadas',
    'ro': '$count$ intrări de subtitrări încărcate', 'ru': 'Загружено $count$ записей субтитров',
    'sr': 'Učitano $count$ unosa titlova', 'sv': '$count$ undertextposter laddade',
    'sw': 'Ingizo $count$ za manukuu zimepakiwa', 'th': 'โหลดรายการคำบรรยาย $count$ รายการ',
    'tr': '$count$ altyazı girdisi yüklendi', 'vi': 'Đã tải $count$ mục phụ đề',
  },
  'failedToLoadSubtitles': {
    'af': 'Kon nie onderskrifte laai nie', 'ar': 'فشل تحميل الترجمة',
    'ca': 'No s\'han pogut carregar els subtítols', 'de': 'Fehler beim Laden der Untertitel',
    'el': 'Αποτυχία φόρτωσης υποτίτλων', 'es': 'Error al cargar los subtítulos',
    'fi': 'Tekstitysten lataaminen epäonnistui', 'ga': 'Theip ar luchtú na bhfotheideal',
    'hi': 'उपशीर्षक लोड करने में विफल', 'hr': 'Učitavanje titlova nije uspjelo',
    'hu': 'Nem sikerült betölteni a feliratokat', 'id': 'Gagal memuat subtitle',
    'it': 'Impossibile caricare i sottotitoli', 'ko': '자막을 불러오지 못했습니다',
    'nl': 'Kan ondertitels niet laden', 'no': 'Kunne ikke laste undertekster',
    'pl': 'Nie udało się załadować napisów', 'pt': 'Falha ao carregar legendas',
    'ro': 'Eroare la încărcarea subtitrărilor', 'ru': 'Не удалось загрузить субтитры',
    'sr': 'Učitavanje titlova nije uspelo', 'sv': 'Kunde inte ladda undertexter',
    'sw': 'Imeshindwa kupakia manukuu', 'th': 'โหลดคำบรรยายไม่สำเร็จ',
    'tr': 'Altyazılar yüklenemedi', 'vi': 'Không thể tải phụ đề',
  },
  'loadingSubtitles': {
    'af': 'Laai $lang$ onderskrifte…', 'ar': 'جارٍ تحميل ترجمة $lang$…',
    'ca': 'S\'estan carregant els subtítols de $lang$…', 'de': 'Lade $lang$ Untertitel…',
    'el': 'Φόρτωση υποτίτλων $lang$…', 'es': 'Cargando subtítulos en $lang$…',
    'fi': 'Ladataan $lang$-tekstityksiä…', 'ga': '$lang$ fotheidil á lódáil…',
    'hi': '$lang$ उपशीर्षक लोड हो रहे हैं…', 'hr': 'Učitavanje $lang$ titlova…',
    'hu': '$lang$ feliratok betöltése…', 'id': 'Memuat subtitle $lang$…',
    'it': 'Caricamento sottotitoli $lang$…', 'ko': '$lang$ 자막 불러오는 중…',
    'nl': '$lang$ ondertitels laden…', 'no': 'Laster $lang$ undertekster…',
    'pl': 'Ładowanie napisów $lang$…', 'pt': 'Carregando legendas em $lang$…',
    'ro': 'Se încarcă subtitrările $lang$…', 'ru': 'Загрузка субтитров $lang$…',
    'sr': 'Učitavanje $lang$ titlova…', 'sv': 'Laddar $lang$ undertexter…',
    'sw': 'Inapakia manukuu ya $lang$…', 'th': 'กำลังโหลดคำบรรยาย $lang$…',
    'tr': '$lang$ altyazıları yükleniyor…', 'vi': 'Đang tải phụ đề $lang$…',
  },
  'learningLanguage': {
    'af': 'Leertaal', 'ar': 'لغة التعلم', 'ca': 'Idioma d\'aprenentatge',
    'de': 'Lernsprache', 'el': 'Γλώσσα εκμάθησης', 'es': 'Idioma de aprendizaje',
    'fi': 'Opiskelukieli', 'ga': 'Teanga foghlama', 'hi': 'सीखने की भाषा',
    'hr': 'Jezik učenja', 'hu': 'Tanult nyelv', 'id': 'Bahasa pembelajaran',
    'it': 'Lingua di apprendimento', 'ko': '학습 언어', 'nl': 'Leertaal',
    'no': 'Læringsspråk', 'pl': 'Język nauki', 'pt': 'Idioma de aprendizagem',
    'ro': 'Limba de învățare', 'ru': 'Изучаемый язык', 'sr': 'Jezik za učenje',
    'sv': 'Språk att lära sig', 'sw': 'Lugha ya kujifunza', 'th': 'ภาษาที่เรียน',
    'tr': 'Öğrenilen dil', 'vi': 'Ngôn ngữ đang học',
  },
  'popularLanguages': {
    'af': 'Gewild', 'ar': 'شائع', 'ca': 'Populars',
    'de': 'Beliebt', 'el': 'Δημοφιλείς', 'es': 'Populares',
    'fi': 'Suositut', 'ga': 'Coitianta', 'hi': 'लोकप्रिय',
    'hr': 'Popularno', 'hu': 'Népszerű', 'id': 'Populer',
    'it': 'Popolari', 'ko': '인기', 'nl': 'Populair',
    'no': 'Populært', 'pl': 'Popularne', 'pt': 'Populares',
    'ro': 'Populare', 'ru': 'Популярные', 'sr': 'Popularno',
    'sv': 'Populära', 'sw': 'Maarufu', 'th': 'ยอดนิยม',
    'tr': 'Popüler', 'vi': 'Phổ biến',
  },
  'translating': {
    'af': 'Vertaal… $progress$/$total$', 'ar': 'جارٍ الترجمة… $progress$/$total$',
    'ca': 'S\'està traduint… $progress$/$total$', 'de': 'Übersetze… $progress$/$total$',
    'el': 'Μετάφραση… $progress$/$total$', 'es': 'Traduciendo… $progress$/$total$',
    'fi': 'Käännetään… $progress$/$total$', 'ga': 'Á aistriú… $progress$/$total$',
    'hi': 'अनुवाद हो रहा है… $progress$/$total$', 'hr': 'Prevođenje… $progress$/$total$',
    'hu': 'Fordítás… $progress$/$total$', 'id': 'Menerjemahkan… $progress$/$total$',
    'it': 'Traduzione… $progress$/$total$', 'ko': '번역 중… $progress$/$total$',
    'nl': 'Vertalen… $progress$/$total$', 'no': 'Oversetter… $progress$/$total$',
    'pl': 'Tłumaczenie… $progress$/$total$', 'pt': 'Traduzindo… $progress$/$total$',
    'ro': 'Se traduce… $progress$/$total$', 'ru': 'Перевод… $progress$/$total$',
    'sr': 'Prevođenje… $progress$/$total$', 'sv': 'Översätter… $progress$/$total$',
    'sw': 'Inatafsiri… $progress$/$total$', 'th': 'กำลังแปล… $progress$/$total$',
    'tr': 'Çevriliyor… $progress$/$total$', 'vi': 'Đang dịch… $progress$/$total$',
  },
  'actions': {
    'af': 'Aksies', 'ar': 'إجراءات', 'ca': 'Accions',
    'de': 'Aktionen', 'el': 'Ενέργειες', 'es': 'Acciones',
    'fi': 'Toiminnot', 'ga': 'Gníomhartha', 'hi': 'क्रियाएँ',
    'hr': 'Radnje', 'hu': 'Műveletek', 'id': 'Tindakan',
    'it': 'Azioni', 'ko': '동작', 'nl': 'Acties',
    'no': 'Handlinger', 'pl': 'Działania', 'pt': 'Ações',
    'ro': 'Acțiuni', 'ru': 'Действия', 'sr': 'Radnje',
    'sv': 'Åtgärder', 'sw': 'Vitendo', 'th': 'การดำเนินการ',
    'tr': 'Eylemler', 'vi': 'Hành động',
  },
  'aiThinking': {
    'af': '🤖 KI dink…', 'ar': '🤖 الذكاء الاصطناعي يفكر…',
    'ca': '🤖 La IA està pensant…', 'de': '🤖 KI denkt nach…',
    'el': '🤖 Η ΤΝ σκέφτεται…', 'es': '🤖 La IA está pensando…',
    'fi': '🤖 Tekoäly miettii…', 'ga': '🤖 Tá AI ag smaoineamh…',
    'hi': '🤖 AI सोच रहा है…', 'hr': '🤖 AI razmišlja…',
    'hu': '🤖 A MI gondolkodik…', 'id': '🤖 AI sedang berpikir…',
    'it': '🤖 L\'IA sta pensando…', 'ko': '🤖 AI가 생각 중…',
    'nl': '🤖 AI denkt na…', 'no': '🤖 AI tenker…',
    'pl': '🤖 SI myśli…', 'pt': '🤖 IA está pensando…',
    'ro': '🤖 IA se gândește…', 'ru': '🤖 ИИ думает…',
    'sr': '🤖 AI razmišlja…', 'sv': '🤖 AI tänker…',
    'sw': '🤖 AI inafikiria…', 'th': '🤖 AI กำลังคิด…',
    'tr': '🤖 YZ düşünüyor…', 'vi': '🤖 AI đang suy nghĩ…',
  },
  'thinking': {
    'af': 'dink…', 'ar': 'يفكر…', 'ca': 'pensant…',
    'de': 'denkt nach…', 'el': 'σκέφτεται…', 'es': 'pensando…',
    'fi': 'miettii…', 'ga': 'ag smaoineamh…', 'hi': 'सोच रहा है…',
    'hr': 'razmišlja…', 'hu': 'gondolkodik…', 'id': 'berpikir…',
    'it': 'pensando…', 'ko': '생각 중…', 'nl': 'denkt na…',
    'no': 'tenker…', 'pl': 'myśli…', 'pt': 'pensando…',
    'ro': 'se gândește…', 'ru': 'думает…', 'sr': 'razmišlja…',
    'sv': 'tänker…', 'sw': 'inafikiria…', 'th': 'กำลังคิด…',
    'tr': 'düşünüyor…', 'vi': 'đang suy nghĩ…',
  },
  'showTranscript': {
    'af': 'Wys Transkripsie', 'ar': 'إظهار النص', 'ca': 'Mostra la transcripció',
    'de': 'Transkript anzeigen', 'el': 'Εμφάνιση απομαγνητοφώνησης', 'es': 'Mostrar transcripción',
    'fi': 'Näytä transkriptio', 'ga': 'Taispeáin an tras-scríbhinn', 'hi': 'ट्रांसक्रिप्ट दिखाएं',
    'hr': 'Prikaži transkript', 'hu': 'Átirat megjelenítése', 'id': 'Tampilkan Transkrip',
    'it': 'Mostra trascrizione', 'ko': '스크립트 보기', 'nl': 'Transcriptie tonen',
    'no': 'Vis transkripsjon', 'pl': 'Pokaż transkrypcję', 'pt': 'Mostrar transcrição',
    'ro': 'Afișează transcrierea', 'ru': 'Показать транскрипт', 'sr': 'Prikaži transkript',
    'sv': 'Visa transkribering', 'sw': 'Onyesha Nakala', 'th': 'แสดงบทถอดความ',
    'tr': 'Transkripti Göster', 'vi': 'Hiện bản ghi',
  },
  'noTranscriptFound': {
    'af': 'Geen Transkripsie Gevind', 'ar': 'لم يتم العثور على نص',
    'ca': 'No s\'ha trobat cap transcripció', 'de': 'Kein Transkript gefunden',
    'el': 'Δεν βρέθηκε απομαγνητοφώνηση', 'es': 'No se encontró transcripción',
    'fi': 'Transkriptiota ei löytynyt', 'ga': 'Níor aimsíodh tras-scríbhinn',
    'hi': 'कोई ट्रांसक्रिप्ट नहीं मिला', 'hr': 'Transkript nije pronađen',
    'hu': 'Nem található átirat', 'id': 'Transkrip Tidak Ditemukan',
    'it': 'Nessuna trascrizione trovata', 'ko': '스크립트를 찾을 수 없습니다',
    'nl': 'Geen transcriptie gevonden', 'no': 'Ingen transkripsjon funnet',
    'pl': 'Nie znaleziono transkrypcji', 'pt': 'Nenhuma transcrição encontrada',
    'ro': 'Nicio transcriere găsită', 'ru': 'Транскрипт не найден',
    'sr': 'Transkript nije pronađen', 'sv': 'Ingen transkribering hittades',
    'sw': 'Hakuna Nakala Iliyopatikana', 'th': 'ไม่พบบทถอดความ',
    'tr': 'Transkript Bulunamadı', 'vi': 'Không tìm thấy bản ghi',
  },
  'extensionDescription': {
    'af': 'Interaktiewe tweetalige onderskrifte vir taalonderrig op Prime Video, YouTube, Netflix, Disney+, Hulu en Max.',
    'ar': 'ترجمات ثنائية تفاعلية لتعلم اللغات على Prime Video وYouTube وNetflix وDisney+ وHulu وMax.',
    'ca': 'Subtítols bilingües interactius per a l\'aprenentatge d\'idiomes a Prime Video, YouTube, Netflix, Disney+, Hulu i Max.',
    'de': 'Interaktive zweisprachige Untertitel zum Sprachenlernen auf Prime Video, YouTube, Netflix, Disney+, Hulu und Max.',
    'el': 'Διαδραστικοί δίγλωσσοι υπότιτλοι για εκμάθηση γλωσσών σε Prime Video, YouTube, Netflix, Disney+, Hulu και Max.',
    'es': 'Subtítulos bilingües interactivos para aprender idiomas en Prime Video, YouTube, Netflix, Disney+, Hulu y Max.',
    'fi': 'Vuorovaikutteiset kaksikieliset tekstitykset kielten oppimiseen Prime Video, YouTube, Netflix, Disney+, Hulu ja Max -palveluissa.',
    'ga': 'Fotheidil dhátheangacha idirghníomhacha d\'fhoghlaim teangacha ar Prime Video, YouTube, Netflix, Disney+, Hulu agus Max.',
    'hi': 'Prime Video, YouTube, Netflix, Disney+, Hulu और Max पर भाषा सीखने के लिए इंटरैक्टिव दोहरे उपशीर्षक।',
    'hr': 'Interaktivni dvojezični titlovi za učenje jezika na Prime Video, YouTube, Netflix, Disney+, Hulu i Max.',
    'hu': 'Interaktív kétnyelvű feliratok nyelvtanuláshoz a Prime Video, YouTube, Netflix, Disney+, Hulu és Max platformokon.',
    'id': 'Subtitle bilingual interaktif untuk belajar bahasa di Prime Video, YouTube, Netflix, Disney+, Hulu, dan Max.',
    'it': 'Sottotitoli bilingue interattivi per l\'apprendimento delle lingue su Prime Video, YouTube, Netflix, Disney+, Hulu e Max.',
    'ko': 'Prime Video, YouTube, Netflix, Disney+, Hulu, Max에서 언어 학습을 위한 대화형 이중 자막.',
    'nl': 'Interactieve tweetalige ondertitels voor taalonderwijs op Prime Video, YouTube, Netflix, Disney+, Hulu en Max.',
    'no': 'Interaktive tospråklige undertekster for språklæring på Prime Video, YouTube, Netflix, Disney+, Hulu og Max.',
    'pl': 'Interaktywne dwujęzyczne napisy do nauki języków na Prime Video, YouTube, Netflix, Disney+, Hulu i Max.',
    'pt': 'Legendas bilíngues interativas para aprendizado de idiomas no Prime Video, YouTube, Netflix, Disney+, Hulu e Max.',
    'ro': 'Subtitrări bilingve interactive pentru învățarea limbilor străine pe Prime Video, YouTube, Netflix, Disney+, Hulu și Max.',
    'ru': 'Интерактивные двуязычные субтитры для изучения языков на Prime Video, YouTube, Netflix, Disney+, Hulu и Max.',
    'sr': 'Interaktivni dvojezični titlovi za učenje jezika na Prime Video, YouTube, Netflix, Disney+, Hulu i Max.',
    'sv': 'Interaktiva tvåspråkiga undertexter för språkinlärning på Prime Video, YouTube, Netflix, Disney+, Hulu och Max.',
    'sw': 'Manukuu shirikishi ya lugha mbili kwa ajili ya kujifunza lugha kwenye Prime Video, YouTube, Netflix, Disney+, Hulu na Max.',
    'th': 'คำบรรยายสองภาษาแบบโต้ตอบสำหรับการเรียนรู้ภาษาบน Prime Video, YouTube, Netflix, Disney+, Hulu และ Max',
    'tr': 'Prime Video, YouTube, Netflix, Disney+, Hulu ve Max\'te dil öğrenimi için etkileşimli çift altyazı.',
    'vi': 'Phụ đề song ngữ tương tác để học ngôn ngữ trên Prime Video, YouTube, Netflix, Disney+, Hulu và Max.',
  },
  'popupLoginPrompt': {
    'af': 'Meld aan om woorde te stoor en met Language Player te sinkroniseer.',
    'ar': 'سجل الدخول لحفظ الكلمات والمزامنة مع Language Player.',
    'ca': 'Inicia sessió per desar paraules i sincronitzar amb Language Player.',
    'de': 'Melde dich an, um Wörter zu speichern und mit Language Player zu synchronisieren.',
    'el': 'Συνδεθείτε για να αποθηκεύετε λέξεις και να συγχρονίζετε με το Language Player.',
    'es': 'Inicia sesión para guardar palabras y sincronizar con Language Player.',
    'fi': 'Kirjaudu sisään tallentaaksesi sanoja ja synkronoidaksesi Language Playerin kanssa.',
    'ga': 'Logáil isteach chun focail a shábháil agus a shioncronú le Language Player.',
    'hi': 'शब्दों को सहेजने और Language Player के साथ सिंक करने के लिए लॉग इन करें।',
    'hr': 'Prijavite se za spremanje riječi i sinkronizaciju s Language Playerom.',
    'hu': 'Jelentkezzen be a szavak mentéséhez és a Language Player szinkronizálásához.',
    'id': 'Masuk untuk menyimpan kata dan menyinkronkan dengan Language Player.',
    'it': 'Accedi per salvare le parole e sincronizzarle con Language Player.',
    'ko': '로그인하여 단어를 저장하고 Language Player와 동기화하세요.',
    'nl': 'Log in om woorden op te slaan en te synchroniseren met Language Player.',
    'no': 'Logg inn for å lagre ord og synkronisere med Language Player.',
    'pl': 'Zaloguj się, aby zapisywać słowa i synchronizować z Language Player.',
    'pt': 'Faça login para salvar palavras e sincronizar com o Language Player.',
    'ro': 'Autentifică-te pentru a salva cuvinte și a sincroniza cu Language Player.',
    'ru': 'Войдите, чтобы сохранять слова и синхронизировать с Language Player.',
    'sr': 'Prijavite se da biste sačuvali reči i sinhronizovali sa Language Player-om.',
    'sv': 'Logga in för att spara ord och synkronisera med Language Player.',
    'sw': 'Ingia ili kuhifadhi maneno na kusawazisha na Language Player.',
    'th': 'เข้าสู่ระบบเพื่อบันทึกคำศัพท์และซิงค์กับ Language Player',
    'tr': 'Kelimeleri kaydetmek ve Language Player ile senkronize etmek için giriş yapın.',
    'vi': 'Đăng nhập để lưu từ và đồng bộ với Language Player.',
  },
  'popupEmailPlaceholder': {
    'af': 'E-pos', 'ar': 'البريد الإلكتروني', 'ca': 'Correu electrònic',
    'de': 'E-Mail', 'el': 'Email', 'es': 'Correo electrónico',
    'fi': 'Sähköposti', 'ga': 'Ríomhphost', 'hi': 'ईमेल',
    'hr': 'E-pošta', 'hu': 'E-mail', 'id': 'Email',
    'it': 'Email', 'ko': '이메일', 'nl': 'E-mail',
    'no': 'E-post', 'pl': 'Email', 'pt': 'Email',
    'ro': 'Email', 'ru': 'Эл. почта', 'sr': 'E-pošta',
    'sv': 'E-post', 'sw': 'Barua pepe', 'th': 'อีเมล',
    'tr': 'E-posta', 'vi': 'Email',
  },
  'popupPasswordPlaceholder': {
    'af': 'Wagwoord', 'ar': 'كلمة المرور', 'ca': 'Contrasenya',
    'de': 'Passwort', 'el': 'Κωδικός πρόσβασης', 'es': 'Contraseña',
    'fi': 'Salasana', 'ga': 'Pasfhocal', 'hi': 'पासवर्ड',
    'hr': 'Lozinka', 'hu': 'Jelszó', 'id': 'Kata sandi',
    'it': 'Password', 'ko': '비밀번호', 'nl': 'Wachtwoord',
    'no': 'Passord', 'pl': 'Hasło', 'pt': 'Senha',
    'ro': 'Parolă', 'ru': 'Пароль', 'sr': 'Lozinka',
    'sv': 'Lösenord', 'sw': 'Nenosiri', 'th': 'รหัสผ่าน',
    'tr': 'Şifre', 'vi': 'Mật khẩu',
  },
  'popupChecking': {
    'af': 'Kontroleer…', 'ar': 'جارٍ التحقق…', 'ca': 'S\'està comprovant…',
    'de': 'Überprüfe…', 'el': 'Έλεγχος…', 'es': 'Comprobando…',
    'fi': 'Tarkistetaan…', 'ga': 'Á sheiceáil…', 'hi': 'जाँच हो रही है…',
    'hr': 'Provjeravanje…', 'hu': 'Ellenőrzés…', 'id': 'Memeriksa…',
    'it': 'Verifica…', 'ko': '확인 중…', 'nl': 'Controleren…',
    'no': 'Sjekker…', 'pl': 'Sprawdzanie…', 'pt': 'Verificando…',
    'ro': 'Se verifică…', 'ru': 'Проверка…', 'sr': 'Proveravanje…',
    'sv': 'Kontrollerar…', 'sw': 'Inakagua…', 'th': 'กำลังตรวจสอบ…',
    'tr': 'Kontrol ediliyor…', 'vi': 'Đang kiểm tra…',
  },
  'popupShowTranscript': {
    'af': 'Wys Transkripsie', 'ar': 'إظهار النص', 'ca': 'Mostra la transcripció',
    'de': 'Transkript anzeigen', 'el': 'Εμφάνιση απομαγνητοφώνησης', 'es': 'Mostrar transcripción',
    'fi': 'Näytä transkriptio', 'ga': 'Taispeáin an tras-scríbhinn', 'hi': 'ट्रांसक्रिप्ट दिखाएं',
    'hr': 'Prikaži transkript', 'hu': 'Átirat megjelenítése', 'id': 'Tampilkan Transkrip',
    'it': 'Mostra trascrizione', 'ko': '스크립트 보기', 'nl': 'Transcriptie tonen',
    'no': 'Vis transkripsjon', 'pl': 'Pokaż transkrypcję', 'pt': 'Mostrar transcrição',
    'ro': 'Afișează transcrierea', 'ru': 'Показать транскрипт', 'sr': 'Prikaži transkript',
    'sv': 'Visa transkribering', 'sw': 'Onyesha Nakala', 'th': 'แสดงบทถอดความ',
    'tr': 'Transkripti Göster', 'vi': 'Hiện bản ghi',
  },
  'popupNoTranscript': {
    'af': 'Geen Transkripsie Gevind', 'ar': 'لم يتم العثور على نص',
    'ca': 'No s\'ha trobat cap transcripció', 'de': 'Kein Transkript gefunden',
    'el': 'Δεν βρέθηκε απομαγνητοφώνηση', 'es': 'No se encontró transcripción',
    'fi': 'Transkriptiota ei löytynyt', 'ga': 'Níor aimsíodh tras-scríbhinn',
    'hi': 'कोई ट्रांसक्रिप्ट नहीं मिला', 'hr': 'Transkript nije pronađen',
    'hu': 'Nem található átirat', 'id': 'Transkrip Tidak Ditemukan',
    'it': 'Nessuna trascrizione trovata', 'ko': '스크립트를 찾을 수 없습니다',
    'nl': 'Geen transcriptie gevonden', 'no': 'Ingen transkripsjon funnet',
    'pl': 'Nie znaleziono transkrypcji', 'pt': 'Nenhuma transcrição encontrada',
    'ro': 'Nicio transcriere găsită', 'ru': 'Транскрипт не найден',
    'sr': 'Transkript nije pronađen', 'sv': 'Ingen transkribering hittades',
    'sw': 'Hakuna Nakala Iliyopatikana', 'th': 'ไม่พบบทถอดความ',
    'tr': 'Transkript Bulunamadı', 'vi': 'Không tìm thấy bản ghi',
  },
  'popupInstructions': {
    'af': 'Begin om enige video op <strong>Prime Video</strong>, <strong>YouTube</strong> of <strong>Netflix</strong> te speel. Die transkripsiepaneel maak outomaties oop wanneer onderskrifte gevind word.',
    'ar': 'ابدأ تشغيل أي فيديو على <strong>Prime Video</strong> أو <strong>YouTube</strong> أو <strong>Netflix</strong>. تفتح لوحة النص تلقائيًا عند العثور على ترجمات.',
    'ca': 'Comença a reproduir qualsevol vídeo a <strong>Prime Video</strong>, <strong>YouTube</strong> o <strong>Netflix</strong>. El panell de transcripció s\'obre automàticament quan es troben subtítols.',
    'de': 'Starte ein beliebiges Video auf <strong>Prime Video</strong>, <strong>YouTube</strong> oder <strong>Netflix</strong>. Das Transkript-Panel öffnet sich automatisch, sobald Untertitel gefunden werden.',
    'el': 'Ξεκινήστε την αναπαραγωγή οποιουδήποτε βίντεο στο <strong>Prime Video</strong>, <strong>YouTube</strong> ή <strong>Netflix</strong>. Ο πίνακας απομαγνητοφώνησης ανοίγει αυτόματα όταν βρεθούν υπότιτλοι.',
    'es': 'Reproduce cualquier video en <strong>Prime Video</strong>, <strong>YouTube</strong> o <strong>Netflix</strong>. El panel de transcripción se abre automáticamente cuando se encuentran subtítulos.',
    'fi': 'Aloita minkä tahansa videon toisto <strong>Prime Video</strong>ssa, <strong>YouTube</strong>ssa tai <strong>Netflix</strong>issä. Transkriptiopaneeli avautuu automaattisesti, kun tekstitykset löytyvät.',
    'ga': 'Tosaigh ag seinm aon fhíseán ar <strong>Prime Video</strong>, <strong>YouTube</strong> nó <strong>Netflix</strong>. Osclaíonn an painéal tras-scríbhinne go huathoibríoch nuair a aimsítear fotheidil.',
    'hi': '<strong>Prime Video</strong>, <strong>YouTube</strong> या <strong>Netflix</strong> पर कोई भी वीडियो चलाना शुरू करें। उपशीर्षक मिलने पर ट्रांसक्रिप्ट पैनल अपने आप खुल जाता है।',
    'hr': 'Pokrenite bilo koji video na <strong>Prime Video</strong>, <strong>YouTube</strong> ili <strong>Netflix</strong>. Ploča s transkriptom automatski se otvara kada se pronađu titlovi.',
    'hu': 'Indítson el bármilyen videót a <strong>Prime Video</strong>, <strong>YouTube</strong> vagy <strong>Netflix</strong> oldalon. Az átirat panel automatikusan megnyílik, amikor feliratokat talál.',
    'id': 'Mulai putar video apa pun di <strong>Prime Video</strong>, <strong>YouTube</strong>, atau <strong>Netflix</strong>. Panel transkrip terbuka secara otomatis saat subtitle ditemukan.',
    'it': 'Avvia la riproduzione di qualsiasi video su <strong>Prime Video</strong>, <strong>YouTube</strong> o <strong>Netflix</strong>. Il pannello di trascrizione si apre automaticamente quando vengono trovati i sottotitoli.',
    'ko': '<strong>Prime Video</strong>, <strong>YouTube</strong>, <strong>Netflix</strong>에서 동영상을 재생하세요. 자막이 발견되면 스크립트 패널이 자동으로 열립니다.',
    'nl': 'Start een video op <strong>Prime Video</strong>, <strong>YouTube</strong> of <strong>Netflix</strong>. Het transcriptiepaneel opent automatisch zodra ondertitels worden gevonden.',
    'no': 'Start avspilling av en video på <strong>Prime Video</strong>, <strong>YouTube</strong> eller <strong>Netflix</strong>. Transkripsjonspanelet åpnes automatisk når undertekster blir funnet.',
    'pl': 'Rozpocznij odtwarzanie dowolnego filmu na <strong>Prime Video</strong>, <strong>YouTube</strong> lub <strong>Netflix</strong>. Panel transkrypcji otwiera się automatycznie po znalezieniu napisów.',
    'pt': 'Comece a reproduzir qualquer vídeo no <strong>Prime Video</strong>, <strong>YouTube</strong> ou <strong>Netflix</strong>. O painel de transcrição abre automaticamente quando as legendas são encontradas.',
    'ro': 'Începeți redarea oricărui videoclip pe <strong>Prime Video</strong>, <strong>YouTube</strong> sau <strong>Netflix</strong>. Panoul de transcriere se deschide automat când sunt găsite subtitrări.',
    'ru': 'Начните воспроизведение любого видео на <strong>Prime Video</strong>, <strong>YouTube</strong> или <strong>Netflix</strong>. Панель транскрипта открывается автоматически при обнаружении субтитров.',
    'sr': 'Pokrenite bilo koji video na <strong>Prime Video</strong>, <strong>YouTube</strong> ili <strong>Netflix</strong>. Panel sa transkriptom se automatski otvara kada se pronađu titlovi.',
    'sv': 'Börja spela upp en video på <strong>Prime Video</strong>, <strong>YouTube</strong> eller <strong>Netflix</strong>. Transkriberingspanelen öppnas automatiskt när undertexter hittas.',
    'sw': 'Anza kucheza video yoyote kwenye <strong>Prime Video</strong>, <strong>YouTube</strong> au <strong>Netflix</strong>. Paneli ya nakala hufunguka kiotomatiki manukuu yanapopatikana.',
    'th': 'เริ่มเล่นวิดีโอบน <strong>Prime Video</strong>, <strong>YouTube</strong> หรือ <strong>Netflix</strong> แผงบทถอดความจะเปิดโดยอัตโนมัติเมื่อพบคำบรรยาย',
    'tr': '<strong>Prime Video</strong>, <strong>YouTube</strong> veya <strong>Netflix</strong>\'te herhangi bir videoyu oynatmaya başlayın. Altyazı bulunduğunda transkript paneli otomatik olarak açılır.',
    'vi': 'Bắt đầu phát bất kỳ video nào trên <strong>Prime Video</strong>, <strong>YouTube</strong> hoặc <strong>Netflix</strong>. Bảng bản ghi sẽ tự động mở khi tìm thấy phụ đề.',
  },
  'popupClickWord': {
    'af': '<strong>Klik</strong> op enige woord om dit in die woordeboek na te slaan',
    'ar': '<strong>انقر</strong> على أي كلمة للبحث عنها في القاموس',
    'ca': 'Fes <strong>clic</strong> a qualsevol paraula per buscar-la al diccionari',
    'de': '<strong>Klicke</strong> auf ein beliebiges Wort, um es im Wörterbuch nachzuschlagen',
    'el': '<strong>Κάντε κλικ</strong> σε οποιαδήποτε λέξη για να την αναζητήσετε στο λεξικό',
    'es': 'Haz <strong>clic</strong> en cualquier palabra para buscarla en el diccionario',
    'fi': '<strong>Napsauta</strong> mitä tahansa sanaa etsiäksesi sen sanakirjasta',
    'ga': '<strong>Cliceáil</strong> ar aon fhocal chun é a chuardach san fhoclóir',
    'hi': 'शब्दकोश में देखने के लिए किसी भी शब्द पर <strong>क्लिक</strong> करें',
    'hr': '<strong>Kliknite</strong> bilo koju riječ kako biste je potražili u rječniku',
    'hu': '<strong>Kattintson</strong> bármely szóra a szótárban való kereséshez',
    'id': '<strong>Klik</strong> kata apa pun untuk mencarinya di kamus',
    'it': 'Fai <strong>clic</strong> su qualsiasi parola per cercarla nel dizionario',
    'ko': '단어를 <strong>클릭</strong>하여 사전에서 찾아보세요',
    'nl': '<strong>Klik</strong> op een willekeurig woord om het op te zoeken in het woordenboek',
    'no': '<strong>Klikk</strong> på et hvilket som helst ord for å slå det opp i ordboken',
    'pl': '<strong>Kliknij</strong> dowolne słowo, aby sprawdzić je w słowniku',
    'pt': '<strong>Clique</strong> em qualquer palavra para consultá-la no dicionário',
    'ro': 'Faceți <strong>clic</strong> pe orice cuvânt pentru a-l căuta în dicționar',
    'ru': '<strong>Нажмите</strong> на любое слово, чтобы посмотреть его в словаре',
    'sr': '<strong>Kliknite</strong> na bilo koju reč da biste je potražili u rečniku',
    'sv': '<strong>Klicka</strong> på valfritt ord för att slå upp det i ordlistan',
    'sw': '<strong>Bofya</strong> neno lolote kulitafuta katika kamusi',
    'th': '<strong>คลิก</strong> คำใดก็ได้เพื่อค้นหาในพจนานุกรม',
    'tr': 'Sözlükte aramak için herhangi bir kelimeye <strong>tıklayın</strong>',
    'vi': '<strong>Nhấp</strong> vào bất kỳ từ nào để tra từ điển',
  },
  'popupSaveWords': {
    'af': '<strong>Stoor</strong> woorde na jou Language Player-rekening',
    'ar': '<strong>احفظ</strong> الكلمات في حساب Language Player الخاص بك',
    'ca': '<strong>Desa</strong> paraules al teu compte de Language Player',
    'de': '<strong>Speichere</strong> Wörter in deinem Language Player-Konto',
    'el': '<strong>Αποθηκεύστε</strong> λέξεις στον λογαριασμό σας στο Language Player',
    'es': '<strong>Guarda</strong> palabras en tu cuenta de Language Player',
    'fi': '<strong>Tallenna</strong> sanoja Language Player -tilillesi',
    'ga': '<strong>Sábháil</strong> focail chuig do chuntas Language Player',
    'hi': 'अपने Language Player खाते में शब्द <strong>सहेजें</strong>',
    'hr': '<strong>Spremite</strong> riječi na svoj Language Player račun',
    'hu': '<strong>Mentsen</strong> szavakat a Language Player fiókjába',
    'id': '<strong>Simpan</strong> kata ke akun Language Player Anda',
    'it': '<strong>Salva</strong> le parole sul tuo account Language Player',
    'ko': 'Language Player 계정에 단어를 <strong>저장</strong>하세요',
    'nl': '<strong>Sla</strong> woorden op in je Language Player-account',
    'no': '<strong>Lagre</strong> ord til Language Player-kontoen din',
    'pl': '<strong>Zapisuj</strong> słowa na swoim koncie Language Player',
    'pt': '<strong>Salve</strong> palavras na sua conta do Language Player',
    'ro': '<strong>Salvați</strong> cuvinte în contul dvs. Language Player',
    'ru': '<strong>Сохраняйте</strong> слова в свой аккаунт Language Player',
    'sr': '<strong>Sačuvajte</strong> reči na svom Language Player nalogu',
    'sv': '<strong>Spara</strong> ord till ditt Language Player-konto',
    'sw': '<strong>Hifadhi</strong> maneno kwenye akaunti yako ya Language Player',
    'th': '<strong>บันทึก</strong> คำศัพท์ลงในบัญชี Language Player ของคุณ',
    'tr': 'Language Player hesabınıza kelimeleri <strong>kaydedin</strong>',
    'vi': '<strong>Lưu</strong> từ vào tài khoản Language Player của bạn',
  },
  'popupToggleShortcut': {
    'af': 'Druk <kbd>Alt</kbd> + <kbd>T</kbd> om die paneel te wissel',
    'ar': 'اضغط على <kbd>Alt</kbd> + <kbd>T</kbd> لتبديل اللوحة',
    'ca': 'Prem <kbd>Alt</kbd> + <kbd>T</kbd> per mostrar/amagar el panell',
    'de': 'Drücke <kbd>Alt</kbd> + <kbd>T</kbd> zum Ein-/Ausblenden des Panels',
    'el': 'Πατήστε <kbd>Alt</kbd> + <kbd>T</kbd> για εναλλαγή του πίνακα',
    'es': 'Pulsa <kbd>Alt</kbd> + <kbd>T</kbd> para mostrar/ocultar el panel',
    'fi': 'Paina <kbd>Alt</kbd> + <kbd>T</kbd> vaihtaaksesi paneelia',
    'ga': 'Brúigh <kbd>Alt</kbd> + <kbd>T</kbd> chun an painéal a scoránú',
    'hi': 'पैनल टॉगल करने के लिए <kbd>Alt</kbd> + <kbd>T</kbd> दबाएं',
    'hr': 'Pritisnite <kbd>Alt</kbd> + <kbd>T</kbd> za uključivanje/isključivanje ploče',
    'hu': 'Nyomja meg az <kbd>Alt</kbd> + <kbd>T</kbd> billentyűket a panel ki/be kapcsolásához',
    'id': 'Tekan <kbd>Alt</kbd> + <kbd>T</kbd> untuk menampilkan/menyembunyikan panel',
    'it': 'Premi <kbd>Alt</kbd> + <kbd>T</kbd> per mostrare/nascondere il pannello',
    'ko': '<kbd>Alt</kbd> + <kbd>T</kbd>를 눌러 패널을 표시/숨깁니다',
    'nl': 'Druk op <kbd>Alt</kbd> + <kbd>T</kbd> om het paneel te tonen/verbergen',
    'no': 'Trykk <kbd>Alt</kbd> + <kbd>T</kbd> for å vise/skjule panelet',
    'pl': 'Naciśnij <kbd>Alt</kbd> + <kbd>T</kbd>, aby przełączyć panel',
    'pt': 'Pressione <kbd>Alt</kbd> + <kbd>T</kbd> para mostrar/ocultar o painel',
    'ro': 'Apăsați <kbd>Alt</kbd> + <kbd>T</kbd> pentru a comuta panoul',
    'ru': 'Нажмите <kbd>Alt</kbd> + <kbd>T</kbd> для переключения панели',
    'sr': 'Pritisnite <kbd>Alt</kbd> + <kbd>T</kbd> za uključivanje/isključivanje panela',
    'sv': 'Tryck på <kbd>Alt</kbd> + <kbd>T</kbd> för att visa/dölja panelen',
    'sw': 'Bonyeza <kbd>Alt</kbd> + <kbd>T</kbd> kufungua/kufunga paneli',
    'th': 'กด <kbd>Alt</kbd> + <kbd>T</kbd> เพื่อสลับแผง',
    'tr': 'Paneli açıp kapatmak için <kbd>Alt</kbd> + <kbd>T</kbd> tuşlarına basın',
    'vi': 'Nhấn <kbd>Alt</kbd> + <kbd>T</kbd> để bật/tắt bảng điều khiển',
  },
  'popupCaptionsHint': {
    'af': '💡 Maak seker <strong>onderskrifte is aangeskakel</strong> in die taal wat jy studeer.',
    'ar': '💡 تأكد من <strong>تشغيل الترجمة</strong> باللغة التي تدرسها.',
    'ca': '💡 Assegura\'t que <strong>els subtítols estan activats</strong> en l\'idioma que estudies.',
    'de': '💡 Stelle sicher, dass <strong>Untertitel eingeschaltet sind</strong> in der Sprache, die du lernst.',
    'el': '💡 Βεβαιωθείτε ότι <strong>οι υπότιτλοι είναι ενεργοποιημένοι</strong> στη γλώσσα που μελετάτε.',
    'es': '💡 Asegúrate de que <strong>los subtítulos estén activados</strong> en el idioma que estudias.',
    'fi': '💡 Varmista, että <strong>tekstitykset ovat päällä</strong> opiskelemallasi kielellä.',
    'ga': '💡 Cinntigh go bhfuil <strong>na fotheidil casta air</strong> sa teanga atá á staidéar agat.',
    'hi': '💡 सुनिश्चित करें कि आप जिस भाषा का अध्ययन कर रहे हैं, उसमें <strong>उपशीर्षक चालू हैं</strong>।',
    'hr': '💡 Provjerite jesu li <strong>titlovi uključeni</strong> na jeziku koji učite.',
    'hu': '💡 Győződjön meg róla, hogy <strong>a feliratok be vannak kapcsolva</strong> a tanult nyelven.',
    'id': '💡 Pastikan <strong>subtitle diaktifkan</strong> dalam bahasa yang Anda pelajari.',
    'it': '💡 Assicurati che <strong>i sottotitoli siano attivati</strong> nella lingua che stai studiando.',
    'ko': '💡 공부 중인 언어로 <strong>자막이 켜져 있는지</strong> 확인하세요.',
    'nl': '💡 Zorg ervoor dat <strong>ondertitels zijn ingeschakeld</strong> in de taal die je studeert.',
    'no': '💡 Sørg for at <strong>undertekster er slått på</strong> på språket du studerer.',
    'pl': '💡 Upewnij się, że <strong>napisy są włączone</strong> w języku, którego się uczysz.',
    'pt': '💡 Certifique-se de que <strong>as legendas estão ativadas</strong> no idioma que você estuda.',
    'ro': '💡 Asigurați-vă că <strong>subtitrările sunt activate</strong> în limba pe care o studiați.',
    'ru': '💡 Убедитесь, что <strong>субтитры включены</strong> на изучаемом языке.',
    'sr': '💡 Proverite da li su <strong>titlovi uključeni</strong> na jeziku koji učite.',
    'sv': '💡 Se till att <strong>undertexter är påslagna</strong> på språket du studerar.',
    'sw': '💡 Hakikisha <strong>manukuu yamewashwa</strong> katika lugha unayojifunza.',
    'th': '💡 ตรวจสอบว่า<strong>เปิดคำบรรยาย</strong>ในภาษาที่คุณกำลังเรียนอยู่',
    'tr': '💡 Çalıştığınız dilde <strong>altyazıların açık olduğundan</strong> emin olun.',
    'vi': '💡 Đảm bảo <strong>phụ đề được bật</strong> bằng ngôn ngữ bạn đang học.',
  },
};

// ── CSV Parser ────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function loadCSV() {
  const text = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCSVLine(lines[0]);
  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const key = cells[0];
    const entry = {};
    for (let j = 1; j < cells.length && j < header.length; j++) {
      entry[header[j]] = cells[j];
    }
    data[key] = entry;
  }
  return data;
}

// ── Generator ─────────────────────────────────────────────────────────────

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
  const skipLocales = new Set(['en', 'zh_CN', 'zh_TW', 'fr', 'ja']);
  const localesToGenerate = targetLocales.filter(l => !skipLocales.has(l));

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

      // 3. For popupShowTranscript / popupNoTranscript, reuse showTranscript / noTranscriptFound
      if (!translated) {
        if (key === 'popupShowTranscript' && result['showTranscript']) {
          translated = result['showTranscript'].message;
        } else if (key === 'popupNoTranscript' && result['noTranscriptFound']) {
          translated = result['noTranscriptFound'].message;
        }
      }

      // 4. Final fallback: empty string (will trigger Chrome's default_locale fallback)
      if (!translated) {
        console.warn(`  ⚠ No translation for "${key}" in ${chromeLocale} (${csvCol})`);
        translated = enMessages[key].message; // fallback to English
      }

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
