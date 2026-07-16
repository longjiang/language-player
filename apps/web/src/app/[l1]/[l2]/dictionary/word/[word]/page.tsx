import { redirect } from 'next/navigation';

/**
 * Legacy route — redirects to the unified dictionary search page.
 * Route: /[l1]/[l2]/dictionary/word/[word] → /[l1]/[l2]/dictionary?q=[word]
 */
export default function WordRedirectPage({
  params,
}: {
  params: { l1: string; l2: string; word: string };
}) {
  redirect(`/${params.l1}/${params.l2}/dictionary?q=${encodeURIComponent(decodeURIComponent(params.word))}`);
}

