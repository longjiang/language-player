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

> **Full schema documentation**: See [`docs/python-dictionary-db-schema.md`](./python-dictionary-db-schema.md) for complete table schemas, ID formats, classifier format, and lookup strategies.

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

---

## Utility Function Catalog

> Quick-reference index of every public function in `utils_*.py`.
> Use this to find existing utilities before writing new ones.

### `utils_cache.py` — Disk-based caching

| Function | Purpose |
|---|---|
| `load_from_inflection_cache(inflector_name, lemma, lang)` | Load cached inflection data |
| `save_to_inflection_cache(inflector_name, lemma, lang, inflection_list)` | Save inflection to cache |
| `load_from_lemmatization_cache(lemmatizer_name, text, lang)` | Load cached lemmatization |
| `save_to_lemmatization_cache(lemmatizer_name, text, lang, token_list)` | Save lemmatization to cache |
| `load_from_local_lemmatized_subs_cache(video_id, lang)` | Load local lemmatized subs |
| `load_from_lemmatized_subs_cache(video_id, lang)` | Load lemmatized subs (local fallback) |
| `load_from_remote_lemmatized_subs_cache(video_id, lang)` | Load remote lemmatized subs |
| `save_to_local_lemmatized_subs_cache(video_id, lang, hash_table)` | Save local lemmatized subs |
| `save_to_remote_lemmatized_subs_cache(video_id, lang, hash_table)` | Save remote lemmatized subs |
| `save_to_lemmatized_subs_cache(video_id, lang, hash_table)` | Save to both local + remote |
| `load_from_subs_search_cache(l2_code, terms, category, tv_show, limit, sort, context)` | Load cached subs search |
| `save_to_subs_search_cache(videos, l2_code, terms, ...)` | Save subs search results to cache |
| `load_from_caption_cache(video_id, name, lang, tlangs, generated_ok, type)` | Load cached captions |
| `save_to_caption_cache(transcript_data, video_id, ...)` | Save captions to cache |
| `load_from_images_cache(term, lang)` | Load cached image search |
| `save_to_images_cache(term, lang, images)` | Save image search to cache |
| `load_from_channel_avatar_cache(channel_id)` | Load cached channel avatar |
| `save_to_channel_avatar_cache(channel_id, img_bytes, content_type)` | Save channel avatar |

### `utils_csv.py` — CSV utilities

| Function | Purpose |
|---|---|
| `read_csv(filename)` | Read CSV file into list of dicts |
| `read_csv_string(string)` | Parse CSV string into list of dicts |
| `data_to_csv(data)` | Convert list of dicts to CSV string |

### `utils_db.py` — MySQL database (connection-pooled, thread-safe)

| Function | Purpose |
|---|---|
| `execute_sql(sql, params, retries)` | Execute SQL, return list of dicts. Auto-retry on lost connections. |
| `connect()` | Get a connection from the pool |
| `disconnect_db()` | Close pool connections |

### `utils_dictionary.py` — Local SQLite dictionary loaders

| Function / Class | Purpose |
|---|---|
| `_get_ro_conn()` | Thread-local read-only SQLite connection |
| `_row_to_dict(row)` | Convert sqlite3.Row to plain dict |
| `_remove_tones(pinyin)` | Strip tone marks from pinyin |
| `_pinyin_to_numeric(pinyin)` | Convert toned pinyin to numeric (chī→chi1) |
| `_remove_jyutping_tones(jyutping)` | Strip tone numbers from Jyutping |
| `_deduplicate(entries)` | Deduplicate dictionary entries by id |
| `CedictLoader` | Chinese dictionary (CC-CEDICT) |
| `CantoLoader` | Cantonese dictionary (CC-Canto) |
| `EdictLoader` | Japanese dictionary (JMdict/EDICT) |
| `KengdicLoader` | Korean dictionary (Kengdic) |
| `KlingonLoader` | Klingon dictionary |
| `WiktionaryLoader` | Wiktionary-based fallback loader |
| `get_loader(l2_code)` | Get appropriate loader for language code |

### `utils_directus.py` — Directus REST API wrapper

| Function | Purpose |
|---|---|
| `suffix_has_only_one_l2(suffix)` | Check if video table suffix is unique to one language |
| `get_items(table, params)` | Fetch items from any Directus collection |
| `get_tv_show(tv_show_id)` | Get single TV show by ID |
| `get_talk(talk_id)` | Get single talk by ID |
| `get_talks(l2_id, extra_params)` | List talks for a language |
| `get_tv_shows(l2_id, extra_params)` | List TV shows for a language |
| `get_talks_by_title(title, l2_id)` | Find talk by title |
| `get_tv_shows_by_title(title, l2_id)` | Find TV show by title |
| `get_new_videos(l2_id, limit, offset)` | Get videos not in any show/talk |
| `check_saved(suffix, ids)` | Check which YouTube IDs exist in DB |
| `count_videos(suffix)` | Count videos in a language shard |
| `delete_videos(suffix, videos)` | Delete videos by list |
| `delete_videos_by_youtube_ids(l2_code, youtube_ids, batch_size)` | Batch-delete by YouTube IDs |
| `nuke_talk(l2_id, talk_id)` | Delete talk + all its videos |
| `nuke_channel(l2_id, channel_id)` | Delete channel + all its videos |
| `nuke_tv_show(l2_id, tv_show_id)` | Delete TV show + all its videos |
| `delete_talk(id)` | Delete single talk |
| `delete_tv_show(id)` | Delete single TV show |
| `delete_channel(channel_id, l2_id)` | Delete channel from DB |
| `saved_videos_in_channels(l2_id, channel_ids, offset)` | Get videos matching channel IDs |
| `delete_video(suffix, id)` | Delete single video |
| `save_video(suffix, payload)` | Create video in Directus |
| `create_talk(payload)` | Create talk entry |
| `create_tv_show(payload)` | Create TV show entry |
| `create_talk_or_tv_show_if_not_existing(cover_youtube_id, l2_id, talk, tv_show)` | Create talk/show if not exists |
| `get_youtube_videos_suffix(l2_id)` | Get video table suffix for language |
| `save_video_with_transcript(video, transcript, l2_id, tv_show, talk)` | Save video + subtitles |
| `count_new_videos(l2_id)` | Count new (unclassified) videos |
| `update_video(suffix, id, payload, verbose)` | Update video fields |
| `get_videos_in_tv_show(l2_id, tv_show_id, limit, offset, subs_l2, sort)` | Get episodes in a TV show |
| `get_videos_in_talk(l2_id, talk_id, ...)` | Get videos in a talk |
| `get_videos_in_channel(l2_id, channel_id, ...)` | Get videos in a channel |
| `update_talk(id, payload)` | Update talk fields |
| `update_tv_show(id, payload)` | Update TV show fields |
| `get_videos(l2_id, page, limit, offset, subs_l2, extra_params, with_count)` | Paginated video list |
| `get_videos_sql(l2_id, page, limit, offset, subs_l2, with_count)` | Paginated video list via raw SQL |
| `get_video(l2_id, video_id, subs_l2)` | Get single video by ID |
| `get_subscription_by_payment_customer_id(payment_customer_id)` | Find subscription by Stripe/PayPal ID |
| `get_users(params)` | Query Directus users |
| `get_latest_user_sessions(limit)` | Get recent user sessions |
| `get_recently_active_users(session_count_limit)` | Get active users with session counts |
| `get_average_sessions_per_user()` | Average sessions per user |
| `get_users_by_email(email)` | Find users by email |
| `get_user_by_email(email)` | Get single user by email |
| `update_user(user_id, payload)` | Update user fields |
| `get_admin_and_pro_users()` | Get admin + pro users |
| `get_users_by_ids(user_ids)` | Get users by list of IDs |
| `get_user_by_id(user_id)` | Get single user by ID |
| `get_data_of_users(user_ids)` | Get user_data records |
| `get_user_viewed_ids(user_id, lang_id)` | Get user's viewed video IDs |
| `save_user_channel_preference(user_id, channel_id, l2_id, status)` | Save channel subscription/block |
| `get_tags_list(l2_code, min_count, limit)` | Compile tag frequency list for language |

### `utils_env.py` — Environment helpers

| Function | Purpose |
|---|---|
| `get_abs_path(relative_path)` | Resolve path relative to project root |

### `utils_gen.py` — General utilities

| Function | Purpose |
|---|---|
| `merge_dicts(dict1, dict2)` | Deep merge two dicts |
| `for_each_batch(items, batch_size, batch_function, options)` | Process items in batches |
| `get_date_now()` | Current datetime |
| `get_date_7_days_later()` | Now + 7 days |
| `get_date_30_days_later()` | Now + 30 days |
| `get_date_365_days_later()` | Now + 365 days |
| `get_date_100yrs()` | Now + 100 years |
| `iso8601_duration_from_minutes(minutes)` | Minutes → ISO 8601 duration |
| `build_query_string(data, prefix)` | Build Directus query string from dict |
| `safe_parse_datetime(date_str)` | Parse datetime safely |
| `pretty_time_format(milliseconds)` | ms → "Xh Ym Zs" |
| `get_exchange_rate(from_currency, to_currency, cache)` | Currency exchange rate |

### `utils_language.py` — Language data & lookups

| Function | Purpose |
|---|---|
| `get_language_data()` | Load full language dataset |
| `get_language_dict()` | Language dict keyed by code |
| `get_locales_data()` | Load locales data |
| `get_locales_dict()` | Locales dict keyed by code |
| `country_by_country_code(code)` | Country info by ISO code |
| `get_countries_by_lang_code(lang_code)` | Countries where language is spoken |
| `locales_by_code(code)` | Locales for language code |
| `host_country_locales_by_code(lang_code)` | Host country locales |
| `code_by_language_dict(language)` | Language dict → code |
| `lang_by_id(l2_id)` | Get language by internal Directus ID |
| `lang_by_code(code)` | Get language by ISO 639-1 code |
| `lang_by_iso639_3(iso639_3)` | Get language by ISO 639-3 code |
| `code_by_lang_id(l2_id)` | Directus ID → ISO 639-1 code |
| `lang_id_by_code(code)` | ISO 639-1 → Directus internal ID |
| `iso_639_3_by_code(code)` | ISO 639-1 → ISO 639-3 |
| `language_name_by_code(code, default)` | Get English name for language code |

### `utils_mailer_lite.py` — Email marketing

| Function | Purpose |
|---|---|
| `new_mailer_lite_subscriber(email, first_name, last_name, role, user_id, group_name)` | Add subscriber |
| `fetch_subscriber_by_email(email)` | Look up subscriber |
| `assign_mailer_lite_subscriber_to_group(email, group_name)` | Add to group |

### `utils_maintenance.py` — Database maintenance

| Function | Purpose |
|---|---|
| `convert_tv_show_to_talk(tv_show_id)` | Change show type to talk |
| `patch_made_for_kids_in_talks(talks)` | Update made_for_kids flag in talks |
| `patch_made_for_kids_in_tv_shows(tv_shows)` | Update made_for_kids flag in shows |
| `patch_made_for_kids_in_all_talks(l2_code)` | Batch update all talks |
| `patch_made_for_kids_in_all_tv_shows(l2_code)` | Batch update all shows |
| `add_info_to_talks_by_content_survey(talks)` | Enrich talks with YouTube metadata |
| `get_videos_with_missing_subs(l2_id, limit, offset)` | Find videos without subtitles |
| `add_missing_subs(db_video, l2_code)` | Fetch + save missing subtitles |
| `add_missing_subs_to_all(l2_code)` | Batch fix all missing subs |
| `search_and_destroy(suffix, offset)` | Find + delete bad videos |
| `search_and_destroy_all(start, offset)` | Batch search and destroy |
| `search_and_destroy_lang_mismatch(l2_id, offset)` | Delete videos with wrong language |
| `add_average_view_count_to_tv_shows(l2_id)` | Update show avg views |
| `add_average_view_count_to_talks(l2_id)` | Update talk avg views |
| `add_info_to_tv_shows_by_content_survey(tv_shows)` | Enrich shows with YouTube data |
| `add_info_to_all_tv_shows_by_content_survey(l2_code, extra_params)` | Batch enrich shows |
| `add_info_to_all_talks_by_content_survey(l2_code, extra_params)` | Batch enrich talks |
| `update_video_with_extra_info(suffix, video_id, video_from_youtube, verbose)` | Update video metadata |
| `add_info_to_videos_and_remove_unfit(l2_id, offset, extra_params)` | Enrich + prune videos |
| `delete_empty_talks(l2_code)` | Remove talks with no videos |
| `delete_empty_tv_shows(l2_code)` | Remove shows with no episodes |
| `add_info_to_videos(l2_id, offset, extra_params, remove_unavailable)` | Enrich videos with YouTube API |
| `change_cover_of_tv_shows_to_first_episode(tv_shows)` | Set cover to first episode |
| `change_cover_of_all_tv_shows_to_first_episode(l2_code, extra_params)` | Batch fix covers |
| `change_cover_of_talks_to_first_episode(talks)` | Set talk cover to first video |
| `change_cover_of_all_talks_to_first_episode(l2_code, extra_params)` | Batch fix talk covers |
| `assign_videos_in_channel_to_talk(l2_id, channel_id, talk_id)` | Move channel videos to talk |
| `mark_unavailable_videos_as_deleted(lang_code)` | Mark deleted/unavailable videos |

### `utils_nlp.py` — NLP / lemmatization pipeline

| Function | Purpose |
|---|---|
| `get_tokenizer(iso_649_3)` | Get tokenizer for ISO 639-3 code |
| `lemmas_from_text(text, lang_code, cache)` | Lemmatize single text |
| `lemmas_from_lines(lines, lang_code, cache)` | Lemmatize multiple lines |
| `lex_div_from_lemmas(lemma_list)` | Compute lexical diversity |
| `mtld_from_lemmas(lemma_list, ttr_threshold)` | MTLD lexical diversity |
| `mtld_from_text(text, lang_code)` | MTLD from raw text |
| `lemmatizer_by_lang(iso_639_3)` | Get lemmatizer for language |

### `utils_scout.py` — Content discovery / crawling

| Function | Purpose |
|---|---|
| `check_transcripts_and_save(youtube_ids, l2_code, talk, tv_show, locale_match)` | Check + save transcripts for videos |
| `expand_show_to_include_all_in_channel(l2_id, l2_code, show_type, show_id)` | Add all channel videos to show |
| `crawl_talks(l2_id, l2_code, start_from_id, skip_ids)` | Discover videos for talks |
| `crawl_tv_shows(l2_id, l2_code, start_from_id, skip_ids)` | Discover videos for TV shows |
| `save_videos_with_subs_in_playlist(l2_code, playlist_id, talk, tv_show, ...)` | Import playlist into talk/show |
| `expand_videos_into_talks(videos, l2_id, l2_code, exclude_channel_ids)` | Group videos into talks by channel |
| `expand_new_videos_into_talks(l2_code, l2_id)` | Classify new videos into talks |
| `expand_videos_into_tv_shows(videos, l2_id, l2_code, exclude_channel_ids)` | Group videos into shows by channel |
| `save_channel_into_talk(l2_code, channel_id, talk, ...)` | Import channel as talk |
| `save_channel_into_tv_show(l2_code, channel_id, tv_show, ...)` | Import channel as TV show |
| `get_google_trends_youtube_search_terms()` | Get trending search terms |
| `get_translated_search_terms(filename)` | Load translated search terms |
| `get_search_terms(lang_code)` | Get search terms for language |
| `save_videos_to_discovery_content_talk(unique_videos, lang_code)` | Save discovery videos |

### `utils_subscription.py` — Subscription management

| Function | Purpose |
|---|---|
| `get_subscriptions_by_owner(owner_id)` | Get user's subscriptions |
| `get_subscriptions_by_owner_email(email)` | Get subscriptions by owner email |
| `get_subscription_by_id(subscription_id)` | Get single subscription |
| `get_subscriptions(params, limit)` | Query subscriptions |
| `add_subscription(payload)` | Create subscription |
| `add_user_acquisition(user_id, source, details)` | Record acquisition source |
| `delete_subscription(subscription_id)` | Delete subscription |
| `update_subscription(subscription_id, payload)` | Update subscription |
| `update_or_add_subscription(payload)` | Upsert subscription |
| `give_free_trial_if_no_active_subscription_exists(owner_id)` | Auto-grant trial |
| `change_subscription_owner(subscription_id, new_owner_id)` | Transfer subscription |
| `check_user_subscription(user_id)` | Check active subscription |
| `get_subscriptions_by_payment_email(email)` | Find by payment email |
| `get_users_by_subscription_payment_email(email)` | Find users by payment email |
| `check_user_subscription_by_email(email)` | Check sub by email |
| `update_or_add_subscription_by_email(email, type, payment_processor, ...)` | Upsert by email |
| `get_subscriptions_by_user_ids(user_ids)` | Batch get subscriptions |

### `utils_video_lemma.py` — Video lemmatization + difficulty

| Function | Purpose |
|---|---|
| `lemmatize_video(video, l2_code, video_id)` | Lemmatize single video's subtitles |
| `lemmatize_videos(videos, lang_code, total_count, done_count)` | Lemmatize batch of videos |
| `lemmatize_all_videos(lang_code, start_percentage)` | Lemmatize all videos for a language |
| `lemmatize_subs_lines_and_store_in_hash_table(lines, lang_code)` | Lemmatize subtitle lines |
| `get_lemmas_from_video(video, lang_code, iso_639_3, lemmatizer)` | Extract lemmas from video |
| `word_freq_from_lemmas(lemmas, lang_code, low_zipf_freq)` | Compute word frequencies |
| `generate_update_sql(video, suffix, row_id, lex_div, word_freq)` | Build UPDATE SQL |
| `add_lex_div_and_word_freq_to_video(video, lang_code, iso_639_3, lemmatizer, suffix)` | Compute + store difficulty |
| `add_lex_div_and_word_freq_to_videos(videos, lang_code, total_count, done_count)` | Batch difficulty scoring |
| `add_lex_div_and_word_freq_to_all_videos(lang_code, start_percentage)` | Score all videos |
| `small_dec(num)` | Format small decimal |
| `level(difficulty)` | Map difficulty score to level 1-7 |
| `create_difficulty_profile_csv()` | Generate difficulty profile |
| `calculate_max_difficulties(difficulties, growth_factor)` | Compute difficulty thresholds |
| `read_difficulty_file(lang_code, column)` | Read difficulty profile |
| `create_difficulty_profile(growth_factor, column)` | Create full difficulty profile |

### `utils_youtube.py` — YouTube API

| Function | Purpose |
|---|---|
| `filter_youtube(v, ...)` | Filter YouTube videos by criteria |
| `get_info_from_youtube(youtube_ids)` | Get basic video info from YouTube API |
| `get_full_details_of_videos(video_ids)` | Get full video details |
| `check_and_filter_youtube(youtube_ids, ...)` | Validate + filter YouTube IDs |
| `list_captions(video_id, l2_code)` | List available captions |
| `find_videos_with_transcripts(videos, l2_code, callback)` | Filter videos with transcripts |
| `channel_id_to_playlist_id(channel_id)` | Convert channel ID to uploads playlist |
| `videos_in_playlist(playlist_id, pageToken)` | List videos in playlist |
| `all_videos_in_playlist(playlist_id)` | Get all videos in playlist |
| `check_youtube_channels(channel_ids)` | Validate channels exist |
| `find_unavailable_videos(youtube_ids)` | Detect deleted/private videos |
| `get_channel_thumbnail(channel_id)` | Get channel thumbnail URL |
| `get_channel_avatar_bytes(channel_id)` | Download channel avatar |
