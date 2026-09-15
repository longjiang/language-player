import { notFound } from 'next/navigation';
import { hasTextbookForL2 } from '@langplayer/textbooks';
import { TextbookPicker } from '@/components/textbook/textbook-picker';

/**
 * Study → Tasks: the textbook picker.
 *
 * The first screen of the feature. Only one textbook exists today, so this
 * renders a single-item list.
 *
 * A textbook exists only for some L2s (today: `zh`), and the nav item is hidden
 * for the others (header.tsx). This URL is a 404 for such an L2 rather than an
 * empty list — the feature does not exist for that language (SPEC-095 §
 * "Initial L2 scope").
 */
export default async function TasksPage(props: { params: Promise<{ l1: string; l2: string }> }) {
  const { l1, l2 } = await props.params;
  if (!hasTextbookForL2(l2)) notFound();
  return <TextbookPicker l1={l1} l2={l2} />;
}
