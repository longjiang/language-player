'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/providers/language-provider';
import { useSavedWordsContext } from '@/providers/saved-words-provider';
import { useVideoPlayer } from '@/providers/video-player-provider';
import { useProgress } from '@/hooks/use-progress';
import { useT } from '@/hooks/use-t';
import { LanguageLevelSelect } from '@/components/language-level-select';
import { baseCode, languageName } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { youtubeThumbnail } from '@/lib/video-service';
import {
  User,
  Mail,
  Clock,
  BookOpen,
  Loader2,
  Play,
  ArrowRight,
  Crown,
  AlertCircle,
  Check,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { YouTubeVideo } from '@langplayer/shared';

interface WatchHistoryItem {
  id: number;
  title?: string;
  youtube_id: string;
  duration?: number;
  date?: string;
  last_position?: number;
}

interface SubscriptionInfo {
  id?: number;
  type?: string;
  expires_on?: string | null;
  payment_processor?: string;
  payment_customer_id?: string;
  status?: string;
}

const PLANS = [
  {
    name: 'Monthly',
    price: '$10',
    interval: '/mo',
    desc: 'Billed monthly. Cancel anytime.',
    benefits: ['Full transcripts', 'Unlimited word examples', 'All Pro features'],
  },
  {
    name: 'Annual',
    price: '$90',
    interval: '/yr',
    desc: 'Billed annually. Save 25%.',
    benefits: ['Full transcripts', 'Unlimited word examples', 'All Pro features', 'Best value'],
  },
  {
    name: 'Lifetime',
    price: '$169',
    interval: '',
    desc: 'One-time payment. Lifetime access.',
    benefits: ['Full transcripts', 'Unlimited word examples', 'All Pro features', 'Pay once, forever'],
  },
];

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { l1, l2 } = useLanguage();
  const { getSavedWords } = useSavedWordsContext();
  const { playVideo } = useVideoPlayer();
  const { level: userLevel, setLevel } = useProgress(baseCode(l2.code));
  const t = useT();

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const userId = session?.user?.id;
  const userEmail = session?.user?.email;
  const userName = session?.user?.name;

  // ── Watch history ──
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setHistoryLoading(false); return; }
    let cancelled = false;
    setHistoryLoading(true);

    fetch(`${PYTHON_API_URL}/user-watch-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, l2: baseCode(l2.code) }),
    })
      .then((res) => (res.status === 404 ? [] : res.ok ? res.json() : []))
      .then((data: WatchHistoryItem[]) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const unique = (Array.isArray(data) ? data : [])
          .filter((item) => {
            if (seen.has(item.youtube_id)) return false;
            seen.add(item.youtube_id);
            return true;
          })
          .slice(0, 5);
        setHistory(unique);
        setHistoryLoading(false);
      })
      .catch(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [userId, l2.code]);

  // ── Saved words ──
  const savedWords = useMemo(() => getSavedWords(l2.code).slice(0, 10), [getSavedWords, l2.code]);

  // ── Subscription ──
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!userId) { setSubLoading(false); return; }
    let cancelled = false;
    setSubLoading(true);
    fetch(`${PYTHON_API_URL}/user-subscription?user_id=${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setSub(data?.id ? data : null);
        setSubLoading(false);
      })
      .catch(() => { if (!cancelled) setSubLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const planType = sub?.type ?? 'free';
  const isFree = !sub || planType === 'free';
  const isLifetime = planType === 'lifetime';
  const expiresOn = sub?.expires_on ? new Date(sub.expires_on.replace(' ', 'T')) : null;
  const isExpired = expiresOn ? expiresOn < new Date() : false;
  const isActive = isLifetime || (expiresOn && !isExpired);
  const willAutoRenew = ['monthly', 'annual'].includes(planType) && !!sub?.payment_customer_id && isActive;
  const daysLeft = expiresOn && isActive
    ? Math.max(0, Math.ceil((expiresOn.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const handleCancel = async () => {
    if (!sub?.payment_customer_id) return;
    setCancelling(true);
    try {
      await fetch(`${PYTHON_API_URL}/cancel-subscription-at-end-of-period`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: sub.payment_customer_id }),
      });
      // Optimistically update
      setSub((prev) => prev ? { ...prev, payment_customer_id: '' } : null);
    } catch {} finally {
      setCancelling(false);
    }
  };

  // ── Helpers ──
  const formatDuration = (d: number | string | undefined): string => {
    if (d == null || d === '') return '';
    let num: number;
    if (typeof d === 'string') {
      const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
      num = m ? (parseInt(m[1] ?? '0') * 3600 + parseInt(m[2] ?? '0') * 60 + parseFloat(m[3] ?? '0')) : parseFloat(d);
      if (isNaN(num)) return '';
    } else {
      num = d;
    }
    const mins = Math.floor(num / 60);
    const secs = Math.floor(num % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayHistory = (item: WatchHistoryItem) => {
    const queue: YouTubeVideo[] = history.map((i) => ({
      youtube_id: i.youtube_id,
      title: i.title,
      id: String(i.id),
      duration: i.duration,
    }));
    const video = queue.find((v) => v.youtube_id === item.youtube_id);
    if (video) playVideo(video, queue, 'recommended');
  };

  // ── Render ──
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Account */}
      <section className="mb-10">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{userName ?? t('label.unknown_user')}</h1>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {userEmail}
            </p>
          </div>
        </div>
      </section>

      {/* Language Level */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-5 w-5" />
          {t('title.settings')}
        </h2>

        <div className="rounded-xl border border-border bg-card p-6">
          <p className="mb-3 text-sm text-muted-foreground">
            {t('msg.set_level_for_recommendations', { l2: languageName(l2.code, l1.code) })}
          </p>
          <div className="max-w-xs">
            <LanguageLevelSelect
              l2Code={baseCode(l2.code)}
              value={userLevel}
              onChange={setLevel}
            />
          </div>
        </div>
      </section>

      {/* Subscription */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Crown className="h-5 w-5 text-amber-500" />
          {t('title.subscription')}
        </h2>
        {subLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isFree ? (
          /* Free user — show upgrade options */
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{t('label.free_account')}</span>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {t('msg.upgrade_to_pro_banner')}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {PLANS.map((plan) => (
                <div key={plan.name} className="rounded-lg border border-border p-4 text-center">
                  <p className="text-lg font-bold">{plan.name}</p>
                  <p className="mt-1 text-2xl font-bold">{plan.price}<span className="text-sm font-normal text-muted-foreground">{plan.interval}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.desc}</p>
                  <ul className="mt-3 space-y-1 text-left text-xs text-muted-foreground">
                    {plan.benefits.map((b) => (
                      <li key={b} className="flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> {b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center">
              <Link href={`/${l1.code}/${l2.code}/go-pro`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                {t('action.upgrade_to_pro')} <ArrowRight className="h-3 w-3" />
              </Link>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('msg.money_back_guarantee')} <a href="mailto:jon.long@zerotohero.ca" className="underline">{t('action.contact_us')}</a>
              </p>
            </div>
          </div>
        ) : (
          /* Pro user — show subscription status */
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${
                    isLifetime ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' :
                    isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {planType === 'monthly' ? t('subscription.monthly_cap') : planType === 'annual' ? t('subscription.annual_cap') : t('subscription.lifetime_cap')}
                    {isLifetime && ' 🎉'}
                    {isExpired && ` ${t('msg.expired_label')}`}
                  </span>
                  {willAutoRenew && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      {t('label.auto_renews')}
                    </span>
                  )}
                </div>
                {daysLeft !== null && isActive && !isLifetime && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('msg.days_remaining', { n: daysLeft })}
                    {willAutoRenew ? ` — ${t('msg.will_auto_renew')}` : ` — ${t('msg.expires_on', { date: expiresOn!.toLocaleDateString() })}`}
                  </p>
                )}
                {isExpired && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{t('msg.subscription_expired')}</p>
                )}
                {isLifetime && (
                  <p className="mt-2 text-sm text-muted-foreground">{t('msg.lifetime_access')}</p>
                )}
                {sub?.payment_processor && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('msg.paid_via', { processor: sub.payment_processor === 'app-store' ? t('payment.apple_app_store') : sub.payment_processor === 'stripe' ? t('payment.stripe') : sub.payment_processor === 'paypal' ? t('payment.paypal') : t('payment.other') })}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                {willAutoRenew && (
                  <Button variant="outline" size="sm" onClick={handleCancel} disabled={cancelling}>
                    {cancelling ? t('msg.cancelling') : t('action.cancel_auto_renewal')}
                  </Button>
                )}
                {!isLifetime && (
                  <Link href={`/${l1.code}/${l2.code}/go-pro`}>
                    <Button variant="outline" size="sm">{isExpired ? t('action.renew') : t('action.upgrade')}</Button>
                  </Link>
                )}
              </div>
            </div>

            {!isLifetime && (
              <div className="mt-6 border-t border-border pt-4">
                <p className="mb-3 text-sm font-medium">{t('msg.want_lifetime_access')}</p>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-500" />
                    <div>
                      <p className="font-semibold">{t('label.lifetime_one_time')}</p>
                      <p className="text-sm text-muted-foreground">{t('msg.pay_once_forever')}</p>
                    </div>
                  </div>
                  <a href="https://languageplayer.io/go-pro" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
                    {t('action.upgrade_to_lifetime')} <ArrowRight className="inline h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Watch History */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Clock className="h-5 w-5 text-primary" />
              {t('title.watch_history')}
            </h2>
            {history.length > 0 && (
              <Link
                href={`/${l1.code}/${l2.code}/watch-history`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('action.see_all')} <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('msg.no_videos_watched')}
            </p>
          ) : (
            <div className="space-y-1">
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handlePlayHistory(item)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50 group"
                >
                  <div className="relative h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-muted">
                    <img
                      src={youtubeThumbnail(item.youtube_id)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                      <Play className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium group-hover:text-primary transition-colors">
                      {item.title ?? t('label.untitled_video')}
                    </p>
                    {item.duration && (
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(item.duration)}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Saved Words */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <BookOpen className="h-5 w-5 text-primary" />
              {t('title.saved_words')}
            </h2>
            {savedWords.length > 0 && (
              <Link
                href={`/${l1.code}/${l2.code}/saved-words`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('action.see_all')} <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          {savedWords.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('msg.no_words_saved')}
            </p>
          ) : (
            <div className="space-y-1">
              {savedWords.map((word) => (
                <Link
                  key={word.id}
                  href={`/${l1.code}/${l2.code}/dictionary?q=${encodeURIComponent(word.forms[0] ?? '')}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  {/* Word */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{word.forms[0] ?? '?'}</span>
                      {word.forms.length > 1 && (
                        <span className="text-xs text-muted-foreground">
                          {word.forms.slice(1).join(', ')}
                        </span>
                      )}
                    </div>
                    {/* Context */}
                    {word.context.videoTitle && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <Play className="mr-1 inline h-3 w-3" />
                        {word.context.videoTitle}
                      </p>
                    )}
                    {word.context.text && !word.context.videoTitle && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {word.context.text}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
