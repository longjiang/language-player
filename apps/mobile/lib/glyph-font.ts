import { Platform } from 'react-native';
import { glyphScript } from '@langplayer/shared';

/**
 * Native regional families. Inter is intentionally not in these stacks: it
 * has no CJK glyphs and its fallback can follow the device language instead
 * of the app's L1/L2 setting.
 *
 * iOS exposes PingFang's regional faces by these names. Android's regional
 * Noto families are present on current system images; unsupported devices
 * fall back to the platform sans family.
 */
export function glyphFontFamily(langTag: string): string | undefined {
  const script = glyphScript(langTag);
  if (Platform.OS === 'ios') {
    if (script === 'ja') return 'Hiragino Sans';
    if (script === 'zh-Hans') return 'PingFang SC';
    if (script === 'zh-Hant') return 'PingFang TC';
    if (script === 'ko') return 'Apple SD Gothic Neo';
    return undefined;
  }

  if (Platform.OS === 'android') {
    if (script === 'ja') return 'Noto Sans CJK JP';
    if (script === 'zh-Hans') return 'Noto Sans CJK SC';
    if (script === 'zh-Hant') return 'Noto Sans CJK TC';
    if (script === 'ko') return 'Noto Sans CJK KR';
  }
  return undefined;
}
