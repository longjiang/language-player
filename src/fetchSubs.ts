import { getTimedText } from "@/src/api/python/video";

interface Subtitle {
  line: string;
  starttime: number;
  duration: number;
}

async function fetchL1Subtitles(
  youtube_id: string,
  l1: { code: string; locale?: string; name?: string }
): Promise<Subtitle[] | undefined> {
  try {
    // First, try to get manual captions
    let subs = await fetchSubtitles(youtube_id, l1, false);

    // If no manual captions, try auto-generated captions
    if (!subs || subs.length === 0) {
      subs = await fetchSubtitles(youtube_id, l1, true);
    }

    return subs;
  } catch (error) {
    console.error(`Failed to fetch subtitles for video ${youtube_id}:`, error);
    return undefined;
  }
}

async function fetchSubtitles(
  youtube_id: string,
  l1: { code: string; locale?: string; name?: string },
  generated: boolean
): Promise<Subtitle[] | undefined> {
  try {
    const response = await getTimedText(
      youtube_id,
      'caption',
      l1.name,
      l1.locale || l1.code,
      undefined,
      generated
    );

    if (response && Array.isArray(response)) {
      return response.map(line => ({
        line: line.text,
        starttime: line.start,
        duration: line.duration
      })).sort((a, b) => a.starttime - b.starttime);
    }
  } catch (error) {
    console.error(`Failed to fetch ${generated ? 'generated' : 'manual'} subtitles:`, error);
  }

  return undefined;
}

export default fetchL1Subtitles;