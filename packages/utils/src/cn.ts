/**
 * Classname utility (like clsx / tailwind-merge).
 * Minimal implementation — works in any JS environment.
 */

type ClassValue = string | undefined | null | false | ClassValue[];

function flatten(args: ClassValue[]): string[] {
  const result: string[] = [];
  for (const arg of args) {
    if (!arg) continue;
    if (typeof arg === 'string') {
      result.push(arg);
    } else if (Array.isArray(arg)) {
      result.push(...flatten(arg));
    }
  }
  return result;
}

/** Combine class names, filtering out falsy values. */
export function cn(...inputs: ClassValue[]): string {
  return flatten(inputs).join(' ');
}
