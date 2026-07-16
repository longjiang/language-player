'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Hls from 'hls.js';
import { useLanguage } from '@/providers/language-provider';
import { languageName } from '@/lib/language-data';
import { PYTHON_API_URL } from '@/lib/api-url';
import { useT } from '@/hooks/use-t';
import { Loader2, Monitor, Wifi, WifiOff } from 'lucide-react';

interface LiveTVChannel {
  id: number;
  name: string;
  logo: string;
  url: string;
  category: string;
  countries: string;
  alive: number | null;
  latency_ms: number | null;
  last_checked: string | null;
}

export default function LiveTVPage() {
  const { l1, l2 } = useLanguage();
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [channels, setChannels] = useState<LiveTVChannel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<LiveTVChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [logoErrors, setLogoErrors] = useState<Set<number>>(new Set());

  // Load channels from Python API
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const l2Code = l2.code; // ISO 639-1, e.g. 'ja', 'zh'
    const url = `${PYTHON_API_URL}/live-tv/channels?l2=${l2Code}&alive=1&sort=latency&limit=200`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        const list: LiveTVChannel[] = data.channels || [];
        setChannels(list);
        setLoading(false);

        // Restore channel from URL, or pick first (lowest latency)
        const tvgID = searchParams.get('tvgID');
        if (tvgID) {
          const found = list.find(c => String(c.id) === tvgID);
          if (found) { setCurrentChannel(found); return; }
        }
        // Default: first channel (sorted by latency, lowest first)
        if (list.length > 0) setCurrentChannel(list[0]!);
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [l2.code]);

  // Play HLS stream
  useEffect(() => {
    if (!currentChannel?.url || !videoRef.current) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const video = videoRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(currentChannel.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = currentChannel.url;
      video.play().catch(() => {});
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set('tvgID', String(currentChannel.id));
    router.replace(`/${l1.code}/${l2.code}/live-tv?${params.toString()}`, { scroll: false });

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentChannel]);

  const setChannel = useCallback((ch: LiveTVChannel) => {
    setCurrentChannel(ch);
  }, []);

  // Extract unique categories from all channels
  const categories = useMemo(() => {
    const cats = new Set<string>();
    channels.forEach(c => {
      if (c.category) {
        c.category.split(';').forEach(part => {
          const trimmed = part.trim();
          if (trimmed) cats.add(trimmed);
        });
      }
    });
    return [...cats].sort();
  }, [channels]);

  // Extract unique countries
  const countries = useMemo(() => {
    const all = channels.flatMap(c =>
      (c.countries || '').split('|').filter(Boolean)
    );
    return [...new Set(all)].sort();
  }, [channels]);

  // Filtered channels (client-side, since API already filters by alive + sort)
  const filteredChannels = useMemo(() => {
    return channels.filter(c => {
      if (country && !(c.countries || '').split('|').includes(country)) return false;
      if (category) {
        const catParts = (c.category || '').split(';').map(s => s.trim());
        if (!catParts.includes(category)) return false;
      }
      return true;
    });
  }, [channels, country, category]);

  const handleLogoError = useCallback((id: number) => {
    setLogoErrors(prev => new Set(prev).add(id));
  }, []);

  const countryName = (code: string) => {
    try {
      const regionNames = new Intl.DisplayNames([l1.code], { type: 'region' });
      return regionNames.of(code.toUpperCase()) || code;
    } catch { return code; }
  };

  // Signal indicator
  const SignalIcon = ({ latency }: { latency: number | null }) => {
    if (latency === null) return <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />;
    if (latency < 300) return <Wifi className="h-3.5 w-3.5 text-green-500" />;
    if (latency < 1000) return <Wifi className="h-3.5 w-3.5 text-yellow-500" />;
    return <Wifi className="h-3.5 w-3.5 text-orange-500" />;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || channels.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <h1 className="text-3xl font-bold">{t('title.live_tv')}</h1>
        <p className="mt-4 text-muted-foreground">
          {t('msg.live_tv_unavailable', { l2: languageName(l2.code, l1.code) })}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">{t('title.live_tv')} — {languageName(l2.code, l1.code)}</h1>

      <div className="lg:flex lg:gap-6">
        {/* Player */}
        <div className="min-w-0 flex-1">
          <div className="relative overflow-hidden rounded-lg bg-black shadow-lg">
            <video
              ref={videoRef}
              className="w-full aspect-video"
              controls
              playsInline
            />
          </div>
          {currentChannel && (
            <div className="mt-2 flex items-center gap-2">
              <SignalIcon latency={currentChannel.latency_ms} />
              <p className="text-sm font-medium truncate">{currentChannel.name}</p>
              {currentChannel.latency_ms != null && (
                <span className="text-xs text-muted-foreground">{currentChannel.latency_ms}ms</span>
              )}
            </div>
          )}
        </div>

        {/* Channel list */}
        <aside className="mt-6 shrink-0 lg:mt-0 lg:w-80 xl:w-96">
          <div className="mb-3 flex gap-2">
            <select
              value={country ?? ''}
              onChange={e => { setCountry(e.target.value || null); }}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-xs"
            >
              <option value="">{t('title.all_countries')}</option>
              {countries.map(c => (
                <option key={c} value={c}>{countryName(c)}</option>
              ))}
            </select>
            <select
              value={category ?? ''}
              onChange={e => setCategory(e.target.value || null)}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-xs"
            >
              <option value="">{t('title.all_categories')}</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto">
            {filteredChannels.map(ch => (
              <button
                key={ch.id}
                onClick={() => setChannel(ch)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  currentChannel?.id === ch.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted/50 text-foreground'
                }`}
              >
                {/* Logo */}
                {ch.logo && !logoErrors.has(ch.id) ? (
                  <img
                    src={ch.logo}
                    alt=""
                    className="h-7 w-9 shrink-0 rounded object-contain"
                    onError={() => handleLogoError(ch.id)}
                  />
                ) : (
                  <div className="flex h-7 w-9 shrink-0 items-center justify-center rounded bg-muted">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}

                {/* Name + category + latency */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs leading-tight">{ch.name}</p>
                  {ch.category && (
                    <p className="truncate text-[10px] text-muted-foreground">{ch.category}</p>
                  )}
                </div>

                {/* Signal */}
                <div className="shrink-0 flex items-center gap-1">
                  <SignalIcon latency={ch.latency_ms} />
                  {ch.latency_ms != null && (
                    <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
                      {ch.latency_ms < 1000
                        ? `${ch.latency_ms}ms`
                        : `${(ch.latency_ms / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>
              </button>
            ))}
            {filteredChannels.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('msg.no_results')}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
