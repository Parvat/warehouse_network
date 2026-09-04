'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Closes a transient popover on Escape or on a pointer press outside it.
 *
 * Escape hands focus back to the control that opened the popover, because a
 * keyboard user who dismisses something has nowhere to go otherwise — the
 * same contract a native <dialog> keeps.
 *
 * `onClose` must be stable, or the listeners are torn down and rebuilt on
 * every render. Refs are stable by contract, so they never re-run the effect.
 */
export function useDismissable(
  open: boolean,
  onClose: () => void,
  triggerRef: RefObject<HTMLElement>,
  panelRef: RefObject<HTMLElement>,
): void {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
      triggerRef.current?.focus();
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onClose, triggerRef, panelRef]);
}
