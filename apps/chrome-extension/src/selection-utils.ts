/**
 * Shared native-selection helpers (SPEC-033 web parity).
 *
 * Both the side-panel subtitle transcript (React, use-selection-popup.ts) and
 * the page tokenizer (vanilla page-content.js) capture browser text selection
 * and look it up in the dictionary as a lemma-less token. These pure functions
 * map a DOM Range back to a UTF-16 character offset within a container's
 * selectable text, skipping `select-none` annotations (ruby readings) so the
 * offset matches the source text rather than the rendered glosses.
 */

/** True when a text node lives inside a `select-none` annotation (ruby
 *  readings, glosses) — excluded from selections and from the source-text
 *  offset mapping. The extension's ruby `<rt>` readings are non-selectable
 *  (`user-select: none`, see content.css) and must be skipped too. */
export function isSelectNoneText(node: Node): boolean {
  return !!node.parentElement?.closest('rt, .select-none');
}

/** Resolve a Range boundary to a text node. Element-node boundaries (e.g.
 *  keyboard selection landing between spans) are moved to the first text node
 *  inside the child they point at. */
function normalizeBoundary(node: Node, offset: number): { node: Node; offset: number } {
  if (node.nodeType === Node.TEXT_NODE) return { node, offset };
  const child = node.childNodes[offset] as Node | undefined;
  if (!child) return { node, offset };
  const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
  const firstText = walker.nextNode();
  return firstText ? { node: firstText, offset: 0 } : { node, offset };
}

/** UTF-16 offset of a Range's start within the container's selectable text.
 *  Walks text nodes in document order, skipping `select-none` annotations, and
 *  adds the range's in-node offset once the boundary node is reached. Returns
 *  null when the offset cannot be determined from the DOM. */
export function selectionStartOffset(container: Node, range: Range): number | null {
  const boundary = normalizeBoundary(range.startContainer, range.startOffset);
  if (boundary.node.nodeType !== Node.TEXT_NODE) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current === boundary.node) return total + boundary.offset;
    if (!isSelectNoneText(current)) {
      total += current.textContent?.length ?? 0;
    }
    current = walker.nextNode();
  }
  return null;
}
