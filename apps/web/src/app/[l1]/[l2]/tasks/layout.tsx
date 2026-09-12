/**
 * Language-pair routes under `/[l1]/[l2]/tasks`.
 *
 * The parent `[l1]/[l2]` layout already validates that both codes are supported
 * and provides the language/settings providers, so this layout only owns the
 * page padding shared by the picker, the TOC and the task view.
 */
export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6">{children}</div>;
}
