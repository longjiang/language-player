# Language Player — Python Backend Architecture Reference

> Analysis of `zerotohero-python/` (Flask 2.x / Python 3.10).
> This is the backend that powers both Classic and GO apps. The Next.js app also uses it.
> **DO NOT EDIT** this directory unless explicitly needed.

## Tech Stack

- **Framework**: Flask 2.x with Blueprints
- **CORS**: flask-cors (permissive for dev origins)
- **Rate Limiting**: flask-limiter (200 req/min per IP, configurable)
- **Compression**: flask-compress
- **Database**: MySQL (via mysql-connector-python with connection pooling) + SQLite (local dictionaries)
- **AI/LLM**: DeepSeek V4 Flash (via OpenAI-compatible SDK), Azure Translator, ChatGPT
- **Auth**: Directus JWT (validated via token)
- **Payments**: Stripe, PayPal, iOS In-App Purchase
- **Deployment**: Passenger WSGI (shared hosting) or `python app.py` (dev)

---

## Application Entry Point

**`app.py`** — Creates Flask app, configures CORS, registering blueprints, rate limiter.

```python
MyApp = Flask(__name__)
Compress(MyApp)
CORS(MyApp, origins=[...])  # localhost:3000, languageplayer.io, etc.
limiter.init_app(MyApp)     # 200 req/min default
register_routes(MyApp)       # 10 blueprints
```

---

## Route Map (Blueprints)

| Blueprint | Routes File | Endpoints |
|---|---|---|
| **core_bp** | `routes/core.py` | `/`, `/chatgpt`, `/images/<term>`, `/img/<term>`, `/timedtext`, `/get_best_l1_subs`, `/get_best_l2_subs`, `/python_version` |
| **text_bp** | `routes/text_routes.py` | `/lemmatize-spacy`, `/lemmatize-chinese`, `/lemmatize-japanese`, `/lemmatize-korean`, `/lemmatize-turkish`, `/lemmatize-arabic`, `/lemmatize-persian`, `/lemmatize-russian`, `/lemmatize-burmese`, `/lemmatize-simple`, `/lemmatize-lemmatization-lists`, `/lemmatize-unified`, `/inflect-pattern`, `/inflect-pymorphy` |
| **translate_bp** | `routes/translate.py` | `/translate` (GET/POST), `/translate_array` (POST), `/translate_video_and_save` |
| **dictionary_bp** | `routes/dictionary.py` | `/dictionary/lookup` (POST) — server-side dictionary search with LLM fallback |
| **video_bp** | `routes/video.py` | `/recommend-videos`, `/subs-search` |
| **analytics_bp** | `routes/analytics.py` | `/ga-active-users-by-city`, `/ga-popular-language-pairs`, `/ga-popular-features`, `/video-tags` |
| **payments_bp** | `routes/payments.py` | `/paypal_checkout_success`, `/in_app_purchase_success`, `/stripe_checkout_success`, Stripe webhooks |
| **subscriptions_bp** | `routes/subscriptions.py` | `/admin/update_or_add_subscription`, `/admin/check_user_subscription`, `/cancel-subscription-at-end-of-period`, `/verification_email`, `/acquisition_survey` |
| **user_data_bp** | `routes/user_data.py` | `/user-data` (GET), `/user-data/sync` (POST) — per-user saved words + progress |

---

## Endpoint Details

### Core Endpoints (`routes/core.py`)

| Endpoint | Method | Purpose | Rate Limit |
|---|---|---|---|
| `/` | GET | Health check / index | — |
| `/chatgpt` | GET/POST | DeepSeek AI chat (cached). Params: `prompt`, `max_tokens`, `cache`. | 60/min |
| `/images/<term>` | GET | Google Images search for a word. Returns image URLs. | — |
| `/img/<term>/<index>` | GET | Proxy a specific image (by index). | — |
| `/timedtext` | GET | YouTube captions. Params: `v` (video ID), `type=list`, `name`, `lang`, `tlangs`. | — |
| `/get_best_l1_subs` | GET | Best available L1 subtitles for a video. Params: `v`, `l1`, `l2`. | — |
| `/get_best_l2_subs` | GET | Best available L2 subtitles for a video. Params: `v`, `l2`, `cache`. | — |

### Lemmatization Endpoints (`routes/text_routes.py`)

All use a factory pattern (`register_text_endpoint()`) to create endpoints from lemmatizer modules.

| Endpoint | Language | Engine |
|---|---|---|
| `/lemmatize-spacy` | Multi (spaCy models) | spaCy |
| `/lemmatize-chinese` | Chinese | Jieba |
| `/lemmatize-japanese` | Japanese | MeCab / fugashi |
| `/lemmatize-korean` | Korean | KoNLPy |
| `/lemmatize-turkish` | Turkish | Turkish lemmatizer |
| `/lemmatize-arabic` | Arabic | Arabic lemmatizer |
| `/lemmatize-persian` | Persian | Persian lemmatizer |
| `/lemmatize-russian` | Russian | pymorphy2 |
| `/lemmatize-burmese` | Burmese | Burmese lemmatizer |
| `/lemmatize-simple` | Any (simple) | Regex/rule-based |
| `/lemmatize-lemmatization-lists` | Vocabulary lists | Static lookup tables |
| `/lemmatize-unified` | Multi (unified) | Combined approach |
| `/inflect-pattern` | Multi | Pattern-based inflection |
| `/inflect-pymorphy` | Russian | pymorphy2 inflection |

Each returns: `{ "md5_hash": [ {word, lemma, pos}, ... ] }`

### Translation (`routes/translate.py`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/translate` | GET/POST | Translate text via ChatGPT. Params: `text`, `l1`, `l2`, `context`. |
| `/translate_array` | POST | Batch-translate array of texts. |
| `/translate_video_and_save` | GET | Translate video subtitles and save to DB. |

### Dictionary (`routes/dictionary.py`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/dictionary/lookup` | POST | Look up a word in local SQLite dictionary. Body: `{text, l2, l1}`. Falls back to LLM via DeepSeek if no local result. Returns up to 5 entries with definitions, pronunciation, level, match_type. |

**Lookup flow**:
1. Load language-specific dictionary loader (CedictLoader for zh, EdictLoader for ja, etc.)
2. Query local SQLite DB
3. If no results → LLM fallback via DeepSeek (`_llm_lookup`)
4. If L1 ≠ English → translate definitions via ChatGPT (`_translate_definitions`)
5. Return results (capped at 5)

### Video (`routes/video.py`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/recommend-videos` | GET | AI-powered video recommendations. Params: `user_id`, `l2`, `level`, `preferred_categories`, `exclude_ids`, `made_for_kids`, `limit`, `music`. |
| `/subs-search` | GET | Search subtitles for terms. Params: `terms`, `l2`, `category`, `tv_show`, `limit`, `context`, `sort`. Returns matched subtitle lines with context. |

### User Data (`routes/user_data.py`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/user-data` | GET | Fetch user's saved_words + progress from Directus. Auth via `Authorization: Bearer <jwt>`. Auto-creates record if not found. |
| `/user-data/sync` | POST | Sync saved_words to Directus. Body: `{saved_words: "<JSON string>"}`. |

### Payments (`routes/payments.py`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/paypal_checkout_success` | GET | PayPal payment verification redirect |
| `/in_app_purchase_success` | POST | iOS IAP receipt validation |
| `/stripe_checkout_success` | GET | Stripe checkout success redirect |

### Subscriptions & Auth (`routes/subscriptions.py`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/cancel-subscription-at-end-of-period` | POST | Stripe subscription cancellation |
| `/verification_email` | POST | Send email verification code |
| `/verification_email/verify` | POST | Verify email code |
| `/acquisition_survey` | POST | Save acquisition survey |
| `/admin/*` | — | Admin subscription management |

---

## Data Layer

### MySQL (via Directus)

The primary database is MySQL managed by Directus 8 (headless CMS). The backend accesses it through:
- **Directus REST API** (`utils_directus.py`) — for CRUD operations via admin token
- **Direct SQL** (`utils_db.py`) — for complex queries (subtitle search, recommendations)

**`utils_db.py`** provides:
- MySQL connection pooling (20 connections, `mysql.connector.pooling`)
- `execute_sql(sql, params)` — thread-safe, returns list of dicts
- Auto-retry on lost connections (3 retries)

**`utils_directus.py`** provides:
- `get_items(table, params)` — fetch items from Directus
- `get_video()`, `update_video()` — video CRUD
- `get_tags_list()` — auto-tagging
- `youtube_videos_suffix` map — per-language video table suffixes

### SQLite (Local Dictionary)

Dictionary data is stored in `data/dictionaries.db` — a local SQLite database created by `import_dict_to_sqlite.py`.

**`utils_dictionary.py`** provides language-specific loaders:
- **CedictLoader** — Chinese (CC-CEDICT)
- **EdictLoader** — Japanese (JMdict/EDICT)
- **CantoLoader** — Cantonese (CC-Canto)
- **KengdicLoader** — Korean (Kengdic)
- **KlingonLoader** — Klingon

Each loader uses thread-local read-only SQLite connections (`threading.local()`).

**Lookup strategy per loader**:
1. Exact match by head (primary form)
2. Exact match by alternate (reading/kana)
3. Exact match by pronunciation (romaji/pinyin)
4. Fuzzy match (substring for romaji/pinyin ≥ 3 chars)

---

## AI / LLM Layer

### DeepSeek V4 Flash (`app_chatgpt.py`)

- Uses OpenAI-compatible SDK pointed at `api.deepseek.com/v1`
- `ask(prompt)` — direct API call
- `ask_with_cache(prompt)` — MD5-hashed disk cache in `cache/chatgpt/`
- Used by: dictionary LLM fallback, ChatGPT explanations, story generation

### Translation (`app_translator_chatgpt.py`)

- `chatgpt_translate_text(text, l1, l2, context)` — single text translation
- `chatgpt_translate_text_array(texts, l1, l2)` — batch translation
- `translate_video_and_save(l1, l2, video_id)` — full video subtitle translation
- Uses placeholder pattern to protect `{variables}` from translation
- Cached in `cache/translation_chatgpt/`

### Azure Translator (`app_translator_azure.py`)

- Alternative translation backend via Azure Cognitive Services

---

## Content Modules

### Video Recommendations (`app_recommendations.py`)

- `recommend_videos(user_id, l2, level, categories, exclude, ...)` 
- Hybrid approach: user preferences + language level + content diversity
- Respects channel subscriptions and "not interested" preferences
- Async with `aiohttp` for parallel processing

### Subtitle Search (`app_subs_search.py`)

- `subs_search(terms, l2_code, category, tv_show, limit, sort, context)`
- Searches video subtitles in MySQL (large text columns)
- Supports wildcards (`*`, `_`, `?`)
- Context window around matched terms
- Results cached for performance

### YouTube Captions (`app_youtubecaptions.py`)

- `caption(video_id, name, lang, tlangs)` — fetch YouTube captions
- `get_best_l1_subs(video_id, l1, l2)` — best L1 subtitles
- `get_best_l2_subs(video_id, l2, use_cache)` — best L2 subtitles
- `list_transcripts_as_array(video_id)` — list available transcripts

---

## Language Processing Modules

### Lemmatizers (per language)

| Module | Language | Engine |
|---|---|---|
| `lemmatize_chinese.py` | Chinese | Jieba segmentation |
| `lemmatize_japanese.py` | Japanese | MeCab / fugashi + UniDic |
| `lemmatize_korean.py` | Korean | KoNLPy (Mecab-ko) |
| `lemmatize_russian.py` | Russian | pymorphy2 |
| `lemmatize_arabic.py` | Arabic | Qalsadi / Farasa |
| `lemmatize_persian.py` | Persian | Hazm |
| `lemmatize_turkish.py` | Turkish | Turkish Morphological Analysis |
| `lemmatize_burmese.py` | Burmese | Custom rules |
| `lemmatize_vietnamese.py` | Vietnamese | spaCy |
| `lemmatize_spacy.py` | Multi | spaCy (50+ languages) |
| `lemmatize_simple.py` | Multi | Rule-based (suffix stripping) |
| `lemmatize_lemmatization_lists.py` | Multi | Static lookups |
| `lemmatize_unified.py` | Multi | Combined approach |

### Inflectors

| Module | Purpose |
|---|---|
| `inflect_pattern.py` | Pattern-based inflection generation |
| `inflect_pymorphy.py` | Russian inflection via pymorphy2 |

---

## Utility Modules

| Module | Purpose |
|---|---|
| `utils_language.py` | Language codes, IDs, names, locales, difficulty profiles, continua language detection. Defines `lang_id_by_code()`, `language_name_by_code()`, `LANGUAGES_WITH_CONTENT`, `YOUTUBE_LANGS`. |
| `utils_db.py` | MySQL connection pooling + `execute_sql()`. Thread-safe. |
| `utils_directus.py` | Directus REST API wrapper. Video, tag, user data access. |
| `utils_dictionary.py` | Local SQLite dictionary loaders (5 languages). Thread-local connections. |
| `utils_csv.py` | CSV reading/writing for subtitle data. |
| `utils_cache.py` | Disk-based caching for expensive operations. |
| `utils_gen.py` | General utilities (`for_each_batch`, etc.). |
| `utils_env.py` | Environment variable helpers, absolute paths. |
| `utils_nlp.py` | NLP utilities. |
| `utils_video_lemma.py` | Video lemmatization pipeline. |
| `utils_subscription.py` | Subscription management utilities. |
| `utils_mailer_lite.py` | Email marketing integration. |
| `utils_maintenance.py` | Database maintenance utilities. |
| `utils_scout.py` | Scout/search utilities. |
| `utils_youtube.py` | YouTube API helpers (`get_info_from_youtube`). |

---

## Lemmatization Pipeline

The lemmatization flow for video subtitles:

1. Frontend requests `/lemmatize-{lang}` with `{text, lang}`
2. Backend routes to appropriate lemmatizer module
3. Each lemmatizer returns `[{word, lemma, pos}, ...]`
4. Results keyed by MD5 hash of original text line
5. Used by: subtitle annotation, WordBlock display, dictionary indexing

---

## Key Architectural Patterns

### 1. Directus as CMS, Flask as API Gateway

Directus 8 is the headless CMS — it stores users, videos, subscriptions, user_data. Flask acts as an API gateway that:
- Abstracts Directus away from clients
- Adds business logic (recommendations, lemmatization, LLM)
- Handles cross-cutting concerns (rate limiting, caching)

### 2. Token-based Auth Flow

1. Client authenticates with Directus → gets JWT
2. Client sends JWT in `Authorization: Bearer <token>` header to Flask
3. Flask extracts user ID from JWT payload (no `/users/me` call)
4. Flask uses admin token for Directus CRUD, user token for user_data

### 3. Dictionary Architecture

- Local SQLite DB contains pre-imported dictionary data
- Fast local lookup (no network) for supported languages
- LLM fallback for words not in dictionary
- Definition translation for non-English L1 users

### 4. Caching Strategy

- **Disk cache**: ChatGPT responses, translations, subs searches
- **Keyed by MD5**: Content-addressed caching
- **Directories**: `cache/chatgpt/`, `cache/translation_chatgpt/`, `cache/dictionary_llm/`

### 5. Error Handling

- Try/except in every route handler
- Returns `{"error": "..." }` with appropriate HTTP status
- Flask-CORS wraps responses (but can't add headers on unhandled exceptions)
- Logging to `logs/application.log`

---

## Environment Variables (`.env`)

| Variable | Purpose |
|---|---|
| `DIRECTUS_TOKEN` | Admin token for Directus API calls |
| `DEEPSEEK_API_KEY` | DeepSeek V4 API key (for chat, dictionary LLM fallback, translation) |
| `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME` | MySQL connection for Direct SQL queries |
| `FLASK_LIMITER_ENABLED` | Enable/disable rate limiting |
| `AZURE_TRANSLATOR_KEY` | Azure Translator API key (alternative translation) |

---

## Dev Setup

```bash
cd zerotohero-python
python3.10 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py  # Runs on http://127.0.0.1:5001
```

---

## Key Differences from Next.js Backend Needs

The Next.js app currently uses this Python backend. Important notes:

1. **Dictionary lookup is server-side**: Unlike GO's local SQLite dictionary, the web app calls `/dictionary/lookup` (Flask endpoint). The GO app downloads the full dictionary DB to the device; the web app does not.

2. **User data sync**: Next.js app uses `/user-data` and `/user-data/sync` endpoints (same as GO). Both apps use Directus `user_data` collection.

3. **Saved words storage**: Classic stores saved words in localStorage + Directus. GO stores in UserDataContext + Directus. Next.js uses `useSavedWords` hook + Directus.

4. **Lemmatization**: All lemmatization is done server-side via Flask. Neither frontend does local tokenization.
