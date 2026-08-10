'use client';

import { logAction } from '@/lib/logger';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Debug instrumentation: logs navigation, clicks on interactive elements,
 * form submissions (including the values the user entered), field changes,
 * and keyboard activation at LOG_LEVEL >= 3, bound to the `[LP Admin]`
 * prefix. Password fields are never captured.
 */

const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[contenteditable="true"]',
].join(', ');

function describeElement(target: HTMLElement): Record<string, unknown> {
  const input = target as HTMLInputElement;
  const anchor = target as HTMLAnchorElement;
  return {
    tag: target.tagName.toLowerCase(),
    id: target.id || undefined,
    type: input.type || undefined,
    name: input.name || undefined,
    text:
      (target.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) || undefined,
    href: anchor.href || undefined,
    ariaLabel: target.getAttribute('aria-label') || undefined,
  };
}

/** Collect every non-sensitive field value in a form (skips passwords). */
function describeForm(form: HTMLFormElement): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  form
    .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    )
    .forEach((field) => {
      if (field instanceof HTMLInputElement && field.type === 'password') return;
      const label = field.id || field.name;
      if (!label) return;
      let value: unknown = field.value;
      if (
        field instanceof HTMLInputElement &&
        (field.type === 'checkbox' || field.type === 'radio')
      ) {
        value = field.checked;
      }
      fields[label] = String(value).slice(0, 200);
    });
  return fields;
}

function describeField(
  field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): Record<string, unknown> {
  const type =
    field instanceof HTMLSelectElement
      ? 'select'
      : field instanceof HTMLTextAreaElement
        ? 'textarea'
        : field.type;
  let value: unknown = field.value;
  if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
    value = field.checked;
  }
  return {
    field: field.id || field.name,
    type,
    value: String(value).slice(0, 200),
  };
}

export function ActionLoggerProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);
  const lastEventAtRef = useRef(0);

  useEffect(() => {
    if (lastPathRef.current !== pathname) {
      logAction('navigation', { path: pathname, from: lastPathRef.current });
      lastPathRef.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    const shouldLog = () => {
      const now = Date.now();
      if (now - lastEventAtRef.current < 300) return false;
      lastEventAtRef.current = now;
      return true;
    };

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
      if (!target || !shouldLog()) return;
      logAction('click', describeElement(target));
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;
      logAction('submit', {
        id: form.id || undefined,
        action: form.getAttribute('action') || undefined,
        method: form.method || undefined,
        fields: describeForm(form),
      });
    };

    const onChange = (event: Event) => {
      const target = event.target;
      if (
        !(
          target instanceof HTMLInputElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLTextAreaElement
        )
      ) {
        return;
      }
      if (target instanceof HTMLInputElement && target.type === 'password') return;
      if (!(target.id || target.name)) return;
      logAction('input', describeField(target));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (!(event.target instanceof Element)) return;
      const tag = event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const target = event.target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
      if (!target || !shouldLog()) return;
      logAction('keyboard', describeElement(target));
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('change', onChange, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  return <>{children}</>;
}
