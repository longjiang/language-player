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

export default function CouponsPage() {
  const templates: SaleTemplates = {};
  for (const locale of SUPPORTED_L1S) {
    const messages = (LOCALES[locale] ?? en) as unknown as Record<string, string>;
    templates[locale] = {
      banner: messages['msg.sale_banner'] ?? '',
      ends: messages['msg.sale_offer_ends'] ?? '',
      code: messages['msg.sale_use_code'] ?? '',
    };
  }
  return <CouponsClient templates={templates} />;
}
