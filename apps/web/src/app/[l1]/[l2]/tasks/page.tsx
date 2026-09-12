import { TextbookPicker } from '@/components/textbook/textbook-picker';

/**
 * Study → Tasks: the textbook picker.
 *
 * The first screen of the feature. Only one textbook exists today, so this
 * renders a single-item list.
 */
export default async function TasksPage(props: { params: Promise<{ l1: string; l2: string }> }) {
  const { l1, l2 } = await props.params;
  return <TextbookPicker l1={l1} l2={l2} />;
}
