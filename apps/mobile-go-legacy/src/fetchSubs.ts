import { getCaption } from "@/src/api/python/video";

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
    // First, try to get manually translated captions
    let subs = await fetchSubtitles(youtube_id, l1, false);

    // If fails, try to get machine translated captions
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
    const subs = await getCaption(
      youtube_id,
      l1.name,
      l1.locale || l1.code,
      undefined,
      generated
    );

    return subs;
  } catch (error) {
    console.error(`Failed to fetch ${generated ? 'generated' : 'manual'} subtitles:`, error);
  }

  return undefined;
}

export default fetchL1Subtitles;