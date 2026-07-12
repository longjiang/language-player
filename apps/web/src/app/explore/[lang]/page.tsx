export default function ExploreLanguagePage({ params }: { params: { lang: string } }) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">Explore: {params.lang.toUpperCase()}</h1>
      <p className="mt-4 text-muted-foreground">
        Video listing for {params.lang} will be ported from the Nuxt classic app.
      </p>
    </main>
  );
}
