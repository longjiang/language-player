'use client';

import Link from 'next/link';
import { useT } from '@/hooks/use-t';
import { Play, Search, BookOpen, Languages, Tv, Sparkles } from 'lucide-react';

export default function HomePage() {
  const t = useT();
  const features = useLandingFeatures();
  return (
    <main className="flex min-h-screen flex-col">
      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-500/10 to-transparent" />
        <div className="relative z-10 max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
            <Sparkles className="h-4 w-4" />
            {t('msg.landing_hero_badge')}
          </div>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            {t('msg.landing_hero_title_1')}{' '}
              <span className="bg-gradient-to-r from-brand-500 to-warm-500 bg-clip-text text-transparent">
              {t('msg.landing_hero_title_2')}
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            {t('msg.landing_hero_desc')}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-8 py-3 font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-700 hover:shadow-xl"
            >
              <Play className="h-5 w-5" /> {t('action.start_watching')}
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-8 py-3 font-semibold transition-all hover:bg-surface-secondary"
            >
              <Search className="h-5 w-5" /> {t('title.explore_media')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-border px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold">{t('msg.everything_you_need')}</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-border bg-surface p-6 transition-shadow hover:shadow-lg dark:bg-surface-dark-secondary"
              >
                <div className="mb-4 inline-flex rounded-lg bg-brand-100 p-3 text-brand-600 dark:bg-brand-900 dark:text-brand-400">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-border px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold">{t('msg.ready_to_start')}</h2>
          <p className="mt-4 text-muted-foreground">
            {t('msg.landing_cta_desc')}
          </p>
          <Link
            href="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-warm-500 px-10 py-3.5 font-semibold text-white shadow-lg shadow-warm-500/25 transition-all hover:bg-warm-600"
          >
              {t('action.sign_up')}
          </Link>
        </div>
      </section>
    </main>
  );
}

function useLandingFeatures() {
  const t = useT();
  return [
    {
      title: t('feature.dual_subtitles'),
      description: t('feature.dual_subtitles_desc'),
      icon: Languages,
    },
    {
      title: t('feature.tap_to_dictionary'),
      description: t('feature.tap_to_dictionary_desc'),
      icon: BookOpen,
    },
    {
      title: t('feature.smart_difficulty'),
      description: t('feature.smart_difficulty_desc'),
      icon: Sparkles,
    },
    {
      title: t('feature.live_tv'),
      description: t('feature.live_tv_desc'),
      icon: Tv,
    },
  ];
}
