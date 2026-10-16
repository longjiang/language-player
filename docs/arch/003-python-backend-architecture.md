# Language Player — Python Backend Architecture Reference

> Analysis of `zerotohero-python/` (Flask 2.x / Python 3.10).
> This is the backend that powers both Classic and GO apps. The Next.js app also uses it.
> **DO NOT EDIT** this directory unless explicitly needed.

> **Current state (2026-08):** auth and data now run on Supabase, not Directus
> — see SPEC-039 and ADR-0023. This doc remains accurate for Flask structure,
> blueprints, and route organization, but the "Auth: Directus JWT" /
> "Database: MySQL" lines below describe the legacy era. Flask CORS now also
> allows `http://localhost:3100` (admin console, SPEC-060).

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
| **translate_bp** | `routes/translate.py` | `/translate` (GET/POST), `/translate_array` (POST) |
| **dictionary_bp** | `routes/dictionary.py` | `/dictionary/lookup` (POST) — server-side dictionary search with LLM fallback |
| **video_bp** | `routes/video.py` | `/recommend-videos`, `/subs-search` |
| **analytics_bp** | `routes/analytics.py` | `/ga-active-users-by-city`, `/ga-popular-language-pairs`, `/ga-popular-features`, `/video-tags` |
| **payments_bp** | `routes/payments.py` | `/paypal_checkout_success`, `/in_app_purchase_success`, `/stripe_checkout_success`, Stripe webhooks |
| **subscriptions_bp** | `routes/subscriptions.py` | `/admin/update_or_add_subscription`, `/admin/check_user_subscription`, `/cancel-subscription-at-end-of-period`, `/verification_email`, `/acquisition_survey` |
| **saved_words_bp** | `routes/saved_words.py` | `/saved-words` (GET/PUT), `/saved-words/<l2>/<id>` (DELETE) — row-level saved words (SPEC-034) |
| **admin_bp** | `routes/admin.py` | `/admin/videos` (GET/POST), `/admin/videos/<id>` (PATCH/DELETE), `POST /admin/tv-shows`, `PATCH|DELETE /admin/tv-shows/<id>`, `POST /admin/talks`, `PATCH|DELETE /admin/talks/<id>`, plus the SPEC-096 ingestion endpoints `/admin/videos/add`, `/admin/videos/add-batch`, `/admin/channels/resolve`, `/admin/channels/add`, `/admin/playlists/add`, the SPEC-098 `/admin/videos/discover`, and the SPEC-099 `/admin/videos/preflight` (metadata-only `video_import_block_reason()` verdict — declared locale, `matches_l2`, block reason — so the console can warn about a language mismatch without importing, and without re-implementing `l2_locales()`); `POST /admin/videos/sweep-unavailable` reports first. `GET /admin/videos` takes `l2`, `q` (title, SPEC-099), `sort`, `limit`, `offset`, `tv_show`, `talk` and the `filter[…][nnull]` flags. Every route on this blueprint is gated by a blueprint-level `before_request` hook (`require_admin()`), so a new route is admin-only by construction; CORS preflight (`OPTIONS`) is exempt |
| **tv_shows_bp** | `routes/tv_shows.py` | `GET /tv-shows`, `/tv-shows/<id>`, `/tv-shows/<id>/episodes`, `GET /talks`, `/talks/<id>`, `/talks/<id>/episodes` — **public**, read-only. There is no admin list route for shows/talks; the admin console reads these |

---

## Endpoint Details

### Core Endpoints (`routes/core.py`)

| Endpoint | Method | Purpose | Rate Limit |
|---|---|---|---|
| `/` | GET | Health check / index | — |
| `/chatgpt` | GET/POST | DeepSeek AI chat (cached). Params: `prompt`, `max_tokens`, `cache`. | 60/min |
| `/images/<term>` | GET | Bing image search for a word (see ADR-0024). Returns `{src, url, title}` objects. | — |
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

Same-language pairs (`l1`/`l2` share a BCP-47 base subtag, e.g. `zh-Hans` ↔ `zh`) **modernize** instead of translating: archaic/literary/legalese/technical prose is rewritten as easy-to-read modern prose with no information loss (`is_same_language` in `utils_language.py`, prompt branch in `app_translator_chatgpt.py`, 2026-09-02). Long paragraphs get an input-scaled output-token budget (`_output_budget`) so the model never silently truncates the tail; the array path additionally splits >300-char texts at sentence boundaries and rejoins them. See SPEC-006 § "Same-Language / Long-Paragraph Translation".

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

### Saved Words (`routes/saved_words.py`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/saved-words?l2=zh` | GET | Fetch the user's saved-word rows from Supabase, grouped by L2. Auth via Supabase JWT (ADR-0023). |
| `/saved-words` | PUT | Upsert one word row (union forms/instances, min/max timestamps). |
| `/saved-words/{l2}/{wordId}` | DELETE | Hard-delete one word row (instances cascade). |

The legacy Directus blob endpoints (`GET /user-data`, `POST /user-data/sync`)
were removed in SPEC-039 WS-8 (2026-08-10).

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

### Postgres (Supabase) — the only content store

Content lives in Supabase Postgres and is reached through `utils_content.py`
(SPEC-038/039). **The Directus layer is gone**: `utils_directus.py`,
`utils_maintenance.py` and `utils_scout.py` were deleted in `cdfce67` /
`dc7b212` once the import endpoints (SPEC-096) replaced the crawler, so there
is no REST-CMS wrapper, no per-language MySQL shard suffix map, and no MySQL
connection pool in the request path.

`utils_db.py` (the MySQL pool and `execute_sql`) is still present for the
remaining batch/notebook tooling, but no live route depends on it.

`utils_content._show_dict()` is the single show/talk row shaper for both the
public getters (`get_tv_shows` / `get_tv_show` / `get_talks` / `get_talk`) and
the admin getters (`get_show` / `get_show_by_title`). It was accidentally
defined twice (the SPEC-039 § 5.8 admin definition shadowed the public one),
which dropped `l2Code` from `GET /tv-shows` and made
`GET /tv-shows/<id>/episodes` return `500 "TV show has no l2"` unless `?l2=`
was passed; SPEC-099 collapsed it back into one definition that returns the
union of both key sets.

### SQLite (Local Dictionary)

Dictionary data is stored in `data/dictionaries.db` — a local SQLite database created by `import_dict_to_sqlite.py`.

> **Full schema documentation**: See [`docs/arch/004-python-dictionary-db-schema.md`](./004-python-dictionary-db-schema.md) for complete table schemas, ID formats, classifier format, and lookup strategies.

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
- Uses placeholder pattern to protect `{variables}` from translation
- Cached in `cache/translation_chatgpt/`

### Azure Translator (`app_translator_azure.py`)

- Alternative translation backend via Azure Cognitive Services.
- Not imported by the app; its Directus-writing `translate_video_and_save`
  was removed with the Directus layer, leaving the translator itself.

---

## Content Modules

### Video Recommendations (`app_recommendations.py`)

- `recommend_videos(user_id, l2, level, categories, exclude, ...)` 
- Hybrid approach: user preferences + language level + content diversity
- Respects channel subscriptions and "not interested" preferences
- Async with `aiohttp` for parallel processing

### Subtitle Search (`app_subs_search.py`) — deleted

The MySQL ngram backend and its `/subs-search-classic` route were retired
(`4f114f9`). Subtitle search is served by `utils_content.subs_search()`
(Postgres trigram / tsvector) through `GET /subs-search`.
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
| `utils_dictionary.py` | Local SQLite dictionary loaders (5 languages). Thread-local connections. |
| `utils_csv.py` | CSV reading/writing for subtitle data. |
| `utils_cache.py` | Disk-based caching for expensive operations. |
| `utils_gen.py` | General utilities (`for_each_batch`, etc.). |
| `utils_env.py` | Environment variable helpers, absolute paths. |
| `utils_nlp.py` | NLP utilities. |
| `utils_video_lemma.py` | Video lemmatization pipeline. |
| `utils_subscription.py` | Subscription management utilities. |
| `utils_mailer_lite.py` | Email marketing integration. |
| `utils_youtube.py` | YouTube Data API helpers: batched `videos.list`, availability, `video_import_block_reason()`, channel/playlist reference resolution. |
| `utils_video_import.py` | The admin ingestion pipeline (SPEC-096): single/list/channel/playlist, show assignment, unavailable sweep. |
| `utils_video_discovery.py` | Candidate discovery from search terms (SPEC-098). |
| `caption_selection.py` | The single caption-selection rule (ARCH-035). |

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

2. **User data sync**: saved words use the Flask row API (`/saved-words`) backed by Supabase (SPEC-034). The legacy Directus blob endpoints (`/user-data`, `/user-data/sync`) were removed in SPEC-039 WS-8.

3. **Saved words storage**: Classic (`zerotohero-nuxt`) uses a localStorage cache + the Flask row API. GO stores in UserDataContext + the Flask row API. Next.js uses the `useSavedWords` hook + the Flask row API. All backed by Supabase rows (SPEC-034).

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

### `utils_directus.py` — deleted

The Directus REST wrapper and its per-language `youtube_videos_suffix` shard
map were removed with the legacy crawler (`cdfce67`). Content reads/writes go
through `utils_content.py` (Supabase), and the one remaining need — "which
prefix block does this language live in" — is `utils_user_data.L2_PREFIX_BY_CODE`
(SPEC-038/061).

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

### `utils_maintenance.py` — deleted

Its jobs were re-homed before deletion (`dc7b212`): missing-subtitle backfill
is the importer's refresh path (SPEC-096), the content survey and cover
selection are `utils_content.summarize_show_from_member_videos()`, and the
unavailable sweep is `POST /admin/videos/sweep-unavailable` — which reports
before it deletes, unlike `search_and_destroy`.

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

### `utils_scout.py` — deleted

The crawler (`save_videos_with_subs_in_playlist` → `check_transcripts_and_save`
→ `save_video_with_transcript`) was deleted in `cdfce67`; its capabilities are
the admin import endpoints (SPEC-096) and the discovery endpoint (SPEC-098).

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
| `compute_lex_div(lemmas)` / `compute_word_freq(lemmas, lang_code)` | Pure MTLD / Zipf helpers shared by both scoring paths |
| `score_lemmas(lemmas, lang_code, lex_div, word_freq)` | Fill the missing half and derive `difficulty` (no DB access) |
| `lemmatize_and_score_video(video, l2_code, ...)` | Cache + score one video (SPEC-096 import path) |
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
| `get_info_from_youtube(youtube_ids)` | Get basic video info from YouTube API |
| `youtube_videos_list(ids, part)` | Low-level `videos.list`; returns `(items, error)` so a quota/auth failure is not mistaken for missing videos |
| `get_video_details_batched(youtube_ids)` | Batch `videos.list` at the API max of 50; returns `(details, unavailable, error)` |
| `normalize_video_ids(ids)` | Split input ids into `(valid, invalid)` by the 11-char id shape (one bad id rejects a whole API batch) |
| `video_import_block_reason(video, force, l2_code)` | `unavailable` / `not_embeddable` / `region_restricted` / `locale_mismatch` / None (`force` bypasses the two soft checks) |
| `l2_locales(l2_code)` / `video_locale_matches_l2(video, l2_code)` | Locale candidates for an L2 — the single definition, used by the importer's eligibility check |
| `parse_channel_reference(ref)` / `channel_from_reference(ref)` | Handle / `UC…` id / channel URL → normalized channel (raises `ChannelNotFoundError` / `YouTubeChannelError`) |
| `parse_playlist_reference(ref)` | Playlist id from an id or any URL with `list=` |
| `channel_id_to_playlist_id(channel_id)` | Convert channel ID to uploads playlist |
| `videos_in_playlist(playlist_id, pageToken)` | List videos in playlist (the pager the import walk uses) |
| `search_youtube_by_google_video(...)` | Scraped Google video search — used only by discovery (SPEC-098) |
| `get_channel_thumbnail(channel_id)` | Get channel thumbnail URL |
| `get_channel_avatar_bytes(channel_id)` | Download channel avatar |

### `caption_selection.py` — Caption selection (ARCH-035)

| Function | Purpose |
|---|---|
| `l2_locale_priority(l2_code)` | Ordered locale candidates for an L2 (own variants, then host-country locales) |
| `choose_best_transcript(candidates, priority)` | The single selection rule: manual before generated, then locale priority |
| `MIN_TRANSCRIPT_LINES` / `is_usable_transcript[_line_count]()` | The shared ingestion minimum-length rule |

### `utils_video_import.py` — Admin video ingestion (SPEC-096)

| Function | Purpose |
|---|---|
| `normalize_l2(l2)` / `require_l2(l2)` | Canonical ISO code for an l2 input (codes, glottolog, legacy Directus ids) |
| `metadata_from_api(video)` | videos.list resource → `youtube_videos` column payload (only fields the API returned) |
| `transcript_csv(youtube_id, l2_code)` | Download the L2 transcript as a `subs_l2` CSV |
| `import_video(conn, youtube_id, l2_code, ...)` | Add or refresh one video (allocate id, cache, score, insert) |
| `import_videos(conn, ids, l2_code, limit, offset)` | Add a list of ids; commits per video, returns results + `next_cursor` |
| `playlist_video_ids(playlist_id, cursor, limit, match_keywords)` | Page a playlist's video ids with an opaque `(page_token, skip)` cursor; keyword filtering counts toward `limit` without moving the cursor off raw positions |
| `compile_match_keywords(patterns)` / `title_matches_keywords(title, patterns)` | Case-insensitive regex title filters (the crawler's `match_keywords`) |
| `_resolve_show` / `_ensure_show` / `_assign_to_show` / `refresh_show_after_walk` | Talk / TV-show resolution, lazy creation from the first imported video, assignment, and the end-of-walk content survey |
| `sweep_unavailable(conn, l2_code, ..., delete)` | Find stored videos YouTube no longer serves (report-first; `delete` is opt-in) |
| `transcript_for_import(youtube_id, l2_code)` | Vet a transcript for storage: shared minimum length, and `caption_service_unavailable` vs `no_transcript` |
| `import_playlist(conn, ref, l2_code, ...)` | Import a playlist (paged) |
| `import_channel(conn, ref, l2_code, ...)` | Import a channel's uploads playlist (paged) |
| `YouTubeApiError` / `PlaylistFetchError` / `UnknownLanguageError` | Mapped to 502 / 502 / 400 by the routes |

