import { SUPPORTED_L1S } from '@langplayer/shared';
import en from '../../../../../packages/shared/locales/en.json';
import zhHans from '../../../../../packages/shared/locales/zh-Hans.json';
import zhHant from '../../../../../packages/shared/locales/zh-Hant.json';
import ar from '../../../../../packages/shared/locales/ar.json';
import de from '../../../../../packages/shared/locales/de.json';
import es from '../../../../../packages/shared/locales/es.json';
import fr from '../../../../../packages/shared/locales/fr.json';
import id from '../../../../../packages/shared/locales/id.json';
import it from '../../../../../packages/shared/locales/it.json';
import ja from '../../../../../packages/shared/locales/ja.json';
import ko from '../../../../../packages/shared/locales/ko.json';
import nl from '../../../../../packages/shared/locales/nl.json';
import pl from '../../../../../packages/shared/locales/pl.json';
import pt from '../../../../../packages/shared/locales/pt.json';
import ru from '../../../../../packages/shared/locales/ru.json';
import th from '../../../../../packages/shared/locales/th.json';
import tr from '../../../../../packages/shared/locales/tr.json';
import vi from '../../../../../packages/shared/locales/vi.json';
import { CouponsClient, type SaleTemplates } from './coupons-client';

/**
 * SPEC-112 — coupons plus the public-sale settings.
 *
 * Server component: the banner preview needs the real translated sentence
 * templates from the shared locale files. Loading them here keeps all 18
 * locale bundles on the server; only the three strings the preview renders are
 * passed to the client.
 *
 * The locale JSON is **nested by key category** (`msg.sale_banner` is
 * `messages.msg.sale_banner`), so the templates are read with a dotted-path
 * lookup, not a flat property access.
 */
const LOCALES: Record<string, unknown> = {
  en,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ar,
  de,
  es,
  fr,
  id,
  it,
  ja,
  ko,
  nl,
  pl,
  pt,
  ru,
  th,
  tr,
  vi,
};

const TEMPLATE_KEYS = ['msg.sale_banner', 'msg.sale_offer_ends', 'msg.sale_use_code'] as const;

/** Read a dotted key from the nested locale JSON. */
function lookup(messages: unknown, dottedKey: string): string {
  let current: unknown = messages;
  for (const part of dottedKey.split('.')) {
    if (!current || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : '';
}

export default function CouponsPage() {
  const english = LOCALES.en;
  const templates: SaleTemplates = {};

  for (const locale of SUPPORTED_L1S) {
    const messages = LOCALES[locale] ?? english;
    // Fall back per key to English so a locale missing one template still
    // renders the sentence (and never shows an empty preview row).
    const [banner, ends, code] = TEMPLATE_KEYS.map(
      (key) => lookup(messages, key) || lookup(english, key),
    );
    templates[locale] = { banner: banner ?? '', ends: ends ?? '', code: code ?? '' };
  }

  return <CouponsClient templates={templates} />;
}
