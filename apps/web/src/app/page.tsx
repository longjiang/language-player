import Link from 'next/link';
import { Play, Search, BookOpen, Languages, Tv, Sparkles } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-500/10 to-transparent" />
        <div className="relative z-10 max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
            <Sparkles className="h-4 w-4" />
            60+ languages supported
          </div>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Learn languages through{' '}
              <span className="bg-gradient-to-r from-brand-500 to-warm-500 bg-clip-text text-transparent">
              video
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Watch YouTube videos, movies, and TV shows with interactive dual subtitles.
            Tap any word for an instant dictionary lookup. Smart difficulty tracking adapts to your
            level.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-8 py-3 font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:bg-brand-700 hover:shadow-xl"
            >
              <Play className="h-5 w-5" /> Start Watching
            </Link>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-8 py-3 font-semibold transition-all hover:bg-surface-secondary"
            >
              <Search className="h-5 w-5" /> Explore Media
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-border px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold">Everything you need to learn</h2>
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
          <h2 className="text-3xl font-bold">Ready to start learning?</h2>
          <p className="mt-4 text-muted-foreground">
            Join thousands of learners who are mastering new languages through authentic video
            content.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-warm-500 px-10 py-3.5 font-semibold text-white shadow-lg shadow-warm-500/25 transition-all hover:bg-warm-600"
          >
            Get Started Free
          </Link>
        </div>
      </section>
    </main>
  );
}

const features = [
  {
    title: 'Dual Subtitles',
    description: 'Watch with subtitles in your native language AND your target language side by side.',
    icon: Languages,
  },
  {
    title: 'Tap-to-Dictionary',
    description: 'Tap any word in the subtitles to see definitions, examples, and pronunciation instantly.',
    icon: BookOpen,
  },
  {
    title: 'Smart Difficulty',
    description: 'Videos are automatically ranked by difficulty so you always watch at the right level.',
    icon: Sparkles,
  },
  {
    title: 'Live TV',
    description: 'Watch live TV channels in your target language with real-time captions.',
    icon: Tv,
  },
];
