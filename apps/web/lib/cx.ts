/**
 * Joins class names, dropping anything falsy.
 *
 * Exists so a conditional class reads as `cx('wq', done && 'done')` rather than
 * a ternary that repeats the base class on both branches.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
