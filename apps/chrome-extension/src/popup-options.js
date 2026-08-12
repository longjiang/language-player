/**
 * Language options for the extension popup (vanilla JS).
 *
 * Bundled by build.mjs into dist/popup-options.js so the popup gets the
 * exact SUPPORTED_L1S / CONTENT_L2S / POPULAR_L1S / POPULAR_L2S lists from
 * @langplayer/shared without re-implementing or hardcoding them.
 */

import { SUPPORTED_L1S, CONTENT_L2S, POPULAR_L1S, POPULAR_L2S } from '@langplayer/shared';

window.LP_EXTENSION_LANGUAGE_OPTIONS = {
  l1Languages: SUPPORTED_L1S,
  l2Languages: CONTENT_L2S,
  popularL1s: POPULAR_L1S,
  popularL2s: POPULAR_L2S,
};
