/** Shapes returned by the SPEC-060 Flask admin user-management endpoints. */

export interface SubscriptionSummary {
  count: number;
  hasActive: boolean;
  plan: string | null;
  expiresOn: string | null;
  subscriptionId: number | null;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  isAdmin: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  confirmedAt: string | null;
  directusId: number | null;
  subscriptions: SubscriptionSummary;
  savedWordsCount: number;
  watchHistoryCount: number;
  totalHours: number;
  totalTimeMs: number;
}

export interface AdminPrivilegeResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
}

export interface AdminSubscription {
  id: number;
  status: string;
  owner: string | number;
  created_on: string | null;
  expires_on: string | null;
  type: string;
  payment_processor: string | null;
  payment_method: string | null;
  payment_email: string | null;
  payment_id: string | null;
  payment_date: string | null;
  notes: string | null;
  payment_customer_id: string | null;
}

export interface SubscriptionInput {
  type: string;
  status?: string;
  expires_on?: string | null;
  payment_processor?: string;
  payment_method?: string;
  payment_email?: string;
  payment_id?: string;
  payment_customer_id?: string;
  notes?: string;
}

export interface ProgressEntry {
  l2: string;
  level: number | string | null;
  timeMs: number | null;
  hours: number | null;
  weeklyHours: number | null;
}

export interface SavedWordContext {
  form?: string;
  text?: string;
  starttime?: number;
  youtube_id?: string;
  videoTitle?: string;
  textTitle?: string;
  translation?: string;
}

export interface SavedWordInstance {
  form: string;
  timestamp: number;
  context: SavedWordContext | null;
}

export interface SavedWordEntry {
  l2: string;
  wordId: string;
  forms: string[];
  firstSavedAt: string | null;
  updatedAt: string | null;
  instances: SavedWordInstance[];
}

export interface WatchHistoryEntry {
  id: number;
  videoId: number;
  lastPosition: number | null;
  date: string | null;
  youtubeId: string | null;
  title: string | null;
  duration: number | null;
  l2Code: string | null;
}

export interface LikeEntry {
  videoId: number;
  createdOn: string | null;
  l2Code: string | null;
  youtubeId: string | null;
  title: string | null;
}

export interface PlaylistEntry {
  id: number;
  title: string;
  l2: string | number | null;
  videoCount: number;
  createdOn: string | null;
}

export interface NoteEntry {
  id: number;
  l2: string | null;
  title: string;
  text: string;
  createdOn: string | null;
}

export interface PhraseEntry {
  l2: string;
  phrase: string;
  exact: boolean;
  date: string | null;
  en: string | null;
}

export interface UserDetail {
  user: AdminUserSummary;
  subscriptions: AdminSubscription[];
  subscriptionSummary: SubscriptionSummary;
  progress: ProgressEntry[];
  savedWords: {
    totalWords: number;
    totalInstances: number;
    byL2: { l2: string; count: number }[];
    recent: SavedWordEntry[];
  };
  watchHistory: { total: number; recent: WatchHistoryEntry[] };
  likes: { total: number; recent: LikeEntry[] };
  playlists: { total: number; items: PlaylistEntry[] };
  notes: { total: number; recent: NoteEntry[] };
  phrases: { total: number; recent: PhraseEntry[] };
  bookshelf: { total: number; books: unknown[] };
  history: { total: number; sample: unknown[] };
  srs: { dailyNewLimit: number | null; totalCards: number; byL2: Record<string, number> };
  settings: { settingsV2: unknown; settingsClassic: unknown };
  acquisition: { source: string; details: unknown; createdOn: string | null } | null;
}
