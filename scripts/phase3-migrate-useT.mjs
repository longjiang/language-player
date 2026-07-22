#!/usr/bin/env node
/**
 * Phase 3: Replace all useLanguage().t with useT() in the GO app.
 *
 * Two patterns:
 *   1. const { t } = useLanguage();          → const t = useT();
 *   2. const { t, l2Lang } = useLanguage();   → const t = useT();
 *                                                const { l2Lang } = useLanguage();
 *
 * Also adds `import { useT } from '@/hooks/use-t';` where missing.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', 'language-player-3');

// Files to process (relative to ROOT)
const FILES = [
  // Category A: only { t }
  'app/(tabs)/_layout.tsx',
  'app/(tabs)/(dictionary)/dictionary/index.tsx',
  'app/(tabs)/(media)/tv-shows.tsx',
  'app/account.tsx',
  'app/acquisition-survey.tsx',
  'app/delete-account.tsx',
  'app/go-pro.tsx',
  'app/login.tsx',
  'app/register.tsx',
  'app/verify-email.tsx',
  'components/CancelSubscription.tsx',
  'components/ChatGPTExplanation.tsx',
  'components/DictionaryLoadingModal.tsx',
  'components/Failure.tsx',
  'components/Header.tsx',
  'components/LevelResetSheet.tsx',
  'components/OnlyLifetimePlan.tsx',
  'components/PricingBlock.tsx',
  'components/ProFeatureModal.tsx',
  'components/SubsSearchResultsList.tsx',
  'components/SyncedTranscript.tsx',
  'components/VideoHero.tsx',
  'components/VideoWithTranscript.tsx',

  // Category B: { t, ... }
  'app/(tabs)/(dictionary)/dictionary/word/[id].tsx',
  'app/(tabs)/(me)/index.tsx',
  'app/(tabs)/(me)/saved-words.tsx',
  'app/(tabs)/(me)/watch-history.tsx',
  'app/(tabs)/(media)/index.tsx',
  'app/(tabs)/(media)/search.tsx',
  'app/index.tsx',
  'app/select-l1.tsx',
  'app/select-l2.tsx',
  'app/select-level.tsx',
  'app/settings.tsx',
  'components/ContextRow.tsx',
  'components/DictionaryComponent.tsx',
  'components/DictionaryEntryContent.tsx',
  'components/LevelButton.tsx',
  'components/PopupDictionaryHeader.tsx',
  'components/SubsSearch.tsx',
  'components/SubsSearchResults.tsx',
  'components/ThemedLanguageSelect.tsx',
  'components/VideoControlBar.tsx',
  'components/YouTubeVideoCard.tsx',
  'contexts/AuthContext.tsx',
  'contexts/DictionaryContext.tsx',
];

const USE_T_IMPORT = "import { useT } from '@/hooks/use-t';";
const USE_LANG_IMPORT = "import { useLanguage } from '@/contexts/LanguageContext';";

let changed = 0;
for (const relPath of FILES) {
  const filePath = resolve(ROOT, relPath);
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    console.log(`  SKIP ${relPath} (not found)`);
    continue;
  }

  const original = content;

  // Add useT import if not present
  if (!content.includes(USE_T_IMPORT) && !content.includes("from '@/hooks/use-t'")) {
    // Insert after the useLanguage import (if present) or at the top
    if (content.includes(USE_LANG_IMPORT)) {
      content = content.replace(USE_LANG_IMPORT, `${USE_LANG_IMPORT}\n${USE_T_IMPORT}`);
    } else {
      // Insert after the first import line
      content = content.replace(/^(import .+;\n)/m, `$1${USE_T_IMPORT}\n`);
    }
  }

  // Pattern 1: const { t } = useLanguage(); → const t = useT();
  const pattern1 = /const \{ t \} = useLanguage\(\);/g;
  if (pattern1.test(content)) {
    content = content.replace(pattern1, 'const t = useT();');
    changed++;
    console.log(`  ✓ ${relPath} (t only)`);
  }

  // Pattern 2: const { t, X, Y } = useLanguage(); → const t = useT(); + const { X, Y } = useLanguage();
  // This handles any number of additional destructured values
  const pattern2 = /const \{ t, (.+?) \} = useLanguage\(\);/g;
  content = content.replace(pattern2, (match, rest) => {
    changed++;
    console.log(`  ✓ ${relPath} (t + ${rest})`);
    return `const t = useT();\n  const { ${rest} } = useLanguage();`;
  });

  // Pattern 2b: const { X, t, Y } = useLanguage();
  const pattern2b = /const \{ (.+?), t, (.+?) \} = useLanguage\(\);/g;
  content = content.replace(pattern2b, (match, before, after) => {
    changed++;
    const rest = `${before.trim()}, ${after.trim()}`;
    console.log(`  ✓ ${relPath} (${rest.trim()}, t)`);
    return `const t = useT();\n  const { ${rest} } = useLanguage();`;
  });

  // Pattern 2c: const { X, t } = useLanguage(); (t is last)
  const pattern2c = /const \{ (.+?), t \} = useLanguage\(\);/g;
  content = content.replace(pattern2c, (match, rest) => {
    changed++;
    console.log(`  ✓ ${relPath} (${rest.trim()}, t last)`);
    return `const t = useT();\n  const { ${rest.trim()} } = useLanguage();`;
  });

  if (content !== original) {
    writeFileSync(filePath, content, 'utf-8');
  }
}

console.log(`\nChanged ${changed} files.`);
