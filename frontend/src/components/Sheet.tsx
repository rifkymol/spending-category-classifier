"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  /** Id of the heading that names the dialog. */
  labelledBy: string;
  /** Gets focus back when the dialog has closed (falls back to whatever had focus on open). */
  returnFocus: HTMLElement | null;
  /** Called once the exit animation has finished: unmount the sheet then. */
  onClosed: () => void;
  /** The contents; `close` plays the exit animation, then calls onClosed. */
  children: (close: () => void) => ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
// If animationend never fires (e.g. the tab is hidden), close anyway.
const EXIT_FALLBACK_MS = 400;

const focusables = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && !el.closest("[inert]"));

/**
 * A modal dialog portalled to <body>: a bottom sheet on phones, a panel from the right from `sm` up.
 * Focus is trapped inside while open (the category picker's listbox, portalled too, is allowed),
 * Esc, the backdrop and the `close` callback close it, the page behind does not scroll, and focus
 * returns to the opener. Animations are switched off under prefers-reduced-motion (globals.css).
 */
export default function Sheet({ labelledBy, returnFocus, onClosed, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => setClosing(true), []);

  // Lock the page scroll, move focus in, and give it back on unmount.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body;
    const saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel)?.focus({ preventScroll: true });

    // Focus that lands outside the dialog (but not in a portalled listbox) is pulled back in.
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (panel && target && !panel.contains(target) && !target.closest('[role="listbox"]')) panel.focus();
    };
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      body.style.overflow = saved.overflow;
      body.style.paddingRight = saved.paddingRight;
      const target = returnFocus?.isConnected ? returnFocus : previous;
      target?.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClosed, EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [closing, onClosed]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Keys the category picker already handled (Esc/Tab closing its listbox) stay with it.
    if (e.defaultPrevented || !panelRef.current) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      const items = focusables(panelRef.current);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-40" onKeyDown={onKeyDown}>
      <div
        aria-hidden="true"
        onClick={close}
        className={`absolute inset-0 bg-black/40 ${closing ? "animate-backdrop-out" : "animate-backdrop-in"}`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClosed();
        }}
        className={`absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-xl bg-surface text-ink shadow-pop outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-md sm:rounded-tr-none sm:rounded-bl-xl ${
          closing ? "animate-sheet-out sm:animate-panel-out" : "animate-sheet-in sm:animate-panel-in"
        }`}
      >
        {children(close)}
      </div>
    </div>,
    document.body,
  );
}
