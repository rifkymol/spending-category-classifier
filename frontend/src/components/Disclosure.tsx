"use client";

import { useId, type ReactNode } from "react";
import { ChevronDownIcon } from "./icons";

interface Props {
  title: string;
  /** A muted one-line summary under the title, e.g. "98 transactions · 3 to review". */
  summary?: string;
  open: boolean;
  onToggle: () => void;
  /** An id for the section, so other controls can scroll to it. */
  id?: string;
  children: ReactNode;
}

/**
 * A collapsible section: a heading button with aria-expanded/aria-controls and a height transition
 * (off under prefers-reduced-motion). The content stays mounted, so its state survives a collapse;
 * while closed it is inert. Open/closed is the parent's state only and is never stored.
 */
export default function Disclosure({ title, summary, open, onToggle, id, children }: Props) {
  const base = useId();
  const buttonId = `${base}-button`;
  const panelId = `${base}-panel`;
  return (
    <section id={id} aria-labelledby={buttonId} tabIndex={id ? -1 : undefined} className="scroll-mt-6 border-t border-line outline-none">
      <h2>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="focus-ring group flex w-full items-center justify-between gap-4 rounded-sm py-5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-base font-semibold tracking-tight">{title}</span>
            {summary && <span className="mt-0.5 block text-sm font-normal text-muted">{summary}</span>}
          </span>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 group-hover:bg-subtle group-hover:text-ink">
            <ChevronDownIcon className={`h-5 w-5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
      </h2>
      <div
        id={panelId}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        {/* The negative margin and padding give focus rings room inside the clipping box. */}
        <div className="-mx-1 min-h-0 overflow-hidden px-1">
          <div className="pb-12 pt-1">{children}</div>
        </div>
      </div>
    </section>
  );
}
