export interface YouTubeVideo {
  youtube_id: string; // The ID of the video on YouTube
  id?: string; // The ID in our own database
  title?: string;
  subs_l2?: string; // The transcript of the video in the second language in CSV format
}

export interface VideoWithTranscriptProps {
  router: any; // Adjust the type according to your router's type
  video: YouTubeVideo;
}


interface Line {
  line: string;
  starttime: string;
}

interface SyncedLine {
  starttime: number;
  l1Line: string;
  l2Line: string;
}