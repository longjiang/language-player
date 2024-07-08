// @/src/api/directus/youtube-video

import { YouTubeVideo } from "@/types";
import { parseDuration } from "@/src/utils";
import { parseSubtitles } from "@/src/subs";
import { getCollectionItems } from "@/src/api/directus";
import { Language } from "@/src/languages";

export const normalizeVideoData = (videoData: any): YouTubeVideo => {
  return {
    ...videoData,
    date: videoData.date ? new Date(videoData.date) : null,
    duration: videoData.duration ? parseDuration(videoData.duration) : null,
    subs_l1: videoData.subs_l1 ? parseSubtitles(videoData.subs_l1) : [],
    subs_l2: videoData.subs_l2 ? parseSubtitles(videoData.subs_l2) : [],
  };
};

export const YOUTUBE_VIDEOS_TABLES = {
  2: [
    'eu', // Basque
    'vi', // Vietnamese
  ],
  3: [
    'ko', // Korean
  ],
  4: [
    'zh', // Chinese
  ],
  5: [
    'en', // English
  ],
  6: [
    'de', // German
  ],
  7: [
    'ja', // Japanese
  ],
  8: [
    'fr', // French
  ],
  9: [
    'es', // Spanish
    'ca', // Catalan
    'ru', // Russian
  ],
  10: [
    'tr', // Turkish
    'pl', // Polish
    'nl', // Dutch
  ],
  11: [
    'he', // Hebrew
    'pt', // Portuguese
    'el', // Greek
    'uk', // Ukrainian
    'cs', // Czech
    'ar', // Arabic
    'sk', // Slovak
    'ms', // Malay
  ],
  12: [
    'it', // Italian
  ],
  13: [
    'id', // Indonesian
    'sv', // Swedish
    'no', // Norwegian
    'nan', // Min Nan
  ],
  14: [
    'th', // Thai
    'my', // Burmese
  ]
};



export function youtubeVideoTableSuffixByL2Code(l2Code: string): string {
  for (const [suffix, codes] of Object.entries(YOUTUBE_VIDEOS_TABLES)) {
    if (codes.includes(l2Code)) {
      return `_${suffix}`;
    }
  }
  return '';
}

export function hasUniqueSuffix(l2Code: string) {
  let unique = false;
  let indexCount = 0;

  // Loop through the tables and count how many times l2Code appears
  for (const [key, codes] of Object.entries(YOUTUBE_VIDEOS_TABLES)) {
    if (codes.includes(l2Code)) {
      indexCount++;
      unique = codes.length === 1; // Check if this code is the only one in its group
      if (indexCount > 1) {
        return false; // If more than one group contains the code, it's not unique
      }
    }
  }

  // Return true if l2Code was found exactly once and was the only code in its group
  return unique && indexCount === 1;
}

export const youtubeVideoCollectionName = (l2Code: string) => {
  const suffix = youtubeVideoTableSuffixByL2Code(l2Code)
  return `youtube_videos${suffix}`;
}

export const getVideosByL2Code = async (l2Lang: Language, includeSubs: boolean = false, params: any = {}) => {
  const collectionName = youtubeVideoCollectionName(l2Lang.code);
  let fields = 'id,l2,title,youtube_id,tv_show,talk,date,lex_div,word_freq,difficulty,views,tags,category,locale,duration,made_for_kids,views,likes,comments,type'
  if (includeSubs) fields = fields + ',subs_l1,subs_l2'
  const filter = 'filter' in params ? params.filter : {}; 
  if (hasUniqueSuffix(l2Lang.code)) filter.l2 = {
    eq: l2Lang.id,
  };
  const items = await getCollectionItems(collectionName, {
    fields,
    filter,
    ...params  // Note that most of the videos in the db are pre-sorted by views
  });
  return items.map(normalizeVideoData) as YouTubeVideo[];
}