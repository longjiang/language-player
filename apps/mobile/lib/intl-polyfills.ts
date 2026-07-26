// Intl polyfills — must be imported before any react-intl usage.
// Hermes (React Native JS engine) lacks Intl.PluralRules.
import '@formatjs/intl-pluralrules/polyfill';

// Locale data for plural rules — one per supported locale.
// Covers all 31 locales from translations.csv.
import '@formatjs/intl-pluralrules/locale-data/en';
import '@formatjs/intl-pluralrules/locale-data/zh';
import '@formatjs/intl-pluralrules/locale-data/af';
import '@formatjs/intl-pluralrules/locale-data/ar';
import '@formatjs/intl-pluralrules/locale-data/ca';
import '@formatjs/intl-pluralrules/locale-data/de';
import '@formatjs/intl-pluralrules/locale-data/el';
import '@formatjs/intl-pluralrules/locale-data/es';
import '@formatjs/intl-pluralrules/locale-data/fi';
import '@formatjs/intl-pluralrules/locale-data/fr';
import '@formatjs/intl-pluralrules/locale-data/ga';
import '@formatjs/intl-pluralrules/locale-data/hi';
import '@formatjs/intl-pluralrules/locale-data/hr';
import '@formatjs/intl-pluralrules/locale-data/hu';
import '@formatjs/intl-pluralrules/locale-data/id';
import '@formatjs/intl-pluralrules/locale-data/it';
import '@formatjs/intl-pluralrules/locale-data/ja';
import '@formatjs/intl-pluralrules/locale-data/ko';
import '@formatjs/intl-pluralrules/locale-data/nl';
import '@formatjs/intl-pluralrules/locale-data/no';
import '@formatjs/intl-pluralrules/locale-data/pl';
import '@formatjs/intl-pluralrules/locale-data/pt';
import '@formatjs/intl-pluralrules/locale-data/ro';
import '@formatjs/intl-pluralrules/locale-data/ru';
import '@formatjs/intl-pluralrules/locale-data/sr';
import '@formatjs/intl-pluralrules/locale-data/sv';
import '@formatjs/intl-pluralrules/locale-data/sw';
import '@formatjs/intl-pluralrules/locale-data/th';
import '@formatjs/intl-pluralrules/locale-data/tr';
import '@formatjs/intl-pluralrules/locale-data/vi';
