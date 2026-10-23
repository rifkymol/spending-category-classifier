"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { colorFor } from "@/lib/format";

export interface PickerGroup {
  key: string;
  /** The group header, e.g. "Needs". */
  label: string;
  /** A dot shown next to the header. */
  color?: string;
  options: readonly string[];
}

interface Props {
  value: string;
  /** The options under group headers. Arrow keys and type-ahead run across all groups. */
  groups: readonly PickerGroup[];
  onChange: (value: string) => void;
  /** Accessible name, e.g. "Category for GRAB*FOOD". */
  label: string;
  /** Display name of an option (e.g. a translated category name); the values stay as they are. */
  optionLabel?: (value: string) => string;
}

const MENU_GAP = 4;
const MENU_WIDTH = 264;
const MENU_MARGIN = 8;
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 28;
const TYPEAHEAD_MS = 700;

type Position = { left: number; top?: number; bottom?: number; maxHeight: number };

/**
 * A pill button that opens a grouped listbox popover (ARIA "button + listbox" pattern, with
 * role="group" sections labelled by their headers). The popover is portalled to <body> with fixed
 * positioning, so a scrolling table never clips it; it flips upward when there is more room above
 * and scrolls when the viewport is short. Typing jumps to the first option whose name, or a word in
 * it, starts with the typed text; typing the same letter again cycles through the matches.
 */
export default function CategoryPicker({ value, groups, onChange, label, optionLabel = (v) => v }: Props) {
  const id = useId();
  const labelId = `${id}-label`;
  const buttonId = `${id}-button`;
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const all = groups.flatMap((g) => g.options);
  // Index of each group's first option in `all`.
  const offsets = groups.map((_, g) => groups.slice(0, g).reduce((n, prev) => n + prev.options.length, 0));

  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Position | null>(null);

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wanted = all.length * ROW_HEIGHT + groups.length * HEADER_HEIGHT + 8;
    const left = Math.max(MENU_MARGIN, Math.min(rect.left, window.innerWidth - MENU_WIDTH - MENU_MARGIN));
    const below = window.innerHeight - rect.bottom - MENU_GAP - MENU_MARGIN;
    const above = rect.top - MENU_GAP - MENU_MARGIN;
    if (below < wanted && above > below) {
      setPos({ left, bottom: window.innerHeight - rect.top + MENU_GAP, maxHeight: Math.min(wanted, above) });
    } else {
      setPos({ left, top: rect.bottom + MENU_GAP, maxHeight: Math.min(wanted, below) });
    }
  }, [all.length, groups.length]);

  const openMenu = (index = Math.max(0, all.indexOf(value))) => {
    setActive(index);
    typed.current = { text: "", at: 0 };
    place();
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const choose = (index: number) => {
    const next = all[index];
    close(true);
    if (next !== undefined && next !== value) onChange(next);
  };

  // Focus the listbox once it is in the DOM, and keep it placed while the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // Keep the active option visible when the menu scrolls.
  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  // Close on a click outside the trigger and the menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu();
    }
  }

  /** Type-ahead: the typed text matches the start of an option's name or of any word in it. */
  function typeAhead(char: string) {
    const now = Date.now();
    const prev = typed.current;
    const text = now - prev.at < TYPEAHEAD_MS ? prev.text + char : char;
    typed.current = { text, at: now };
    // One repeated letter cycles through matches; longer text refines from the current option.
    const cycling = [...text].every((c) => c === text[0]);
    const needle = cycling ? text[0] : text;
    const matches = (i: number) => {
      const name = optionLabel(all[i]).toLowerCase();
      return name.startsWith(needle) || name.includes(` ${needle}`);
    };
    const start = cycling ? 1 : 0;
    for (let step = start; step < all.length + start; step++) {
      const i = (active + step) % all.length;
      if (matches(i)) {
        setActive(i);
        return;
      }
    }
  }

  function onListKey(e: KeyboardEvent<HTMLDivElement>) {
    const last = all.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(last, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(last);
        break;
      case "Enter":
        e.preventDefault();
        choose(active);
        break;
      case " ":
        e.preventDefault();
        // A space inside typed text ("eating out") continues the search; on its own it chooses.
        if (Date.now() - typed.current.at < TYPEAHEAD_MS && typed.current.text) typeAhead(" ");
        else choose(active);
        break;
      case "Escape":
      case "Tab":
        e.preventDefault();
        close(true);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          typeAhead(e.key.toLowerCase());
        }
    }
  }

  return (
    <>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${buttonId}`}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onButtonKey}
        className="focus-ring inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-2.5 pr-1.5 text-sm text-ink transition-colors duration-150 hover:border-line-strong"
      >
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorFor(value) }} />
        <span className="truncate">{optionLabel(value)}</span>
        <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={labelId}
            aria-activedescendant={optionId(active)}
            onKeyDown={onListKey}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next !== buttonRef.current && !listRef.current?.contains(next)) setOpen(false);
            }}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_WIDTH, maxHeight: pos.maxHeight }}
            className={`fixed z-50 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-1 text-sm text-ink shadow-pop outline-none animate-pop-in ${
              pos.bottom !== undefined ? "origin-bottom" : "origin-top"
            }`}
          >
            {groups.map((group, g) => {
              const headerId = `${id}-group-${group.key}`;
              return (
                <div key={group.key} role="group" aria-labelledby={headerId}>
                  <div
                    id={headerId}
                    style={{ height: HEADER_HEIGHT }}
                    className="flex select-none items-end gap-1.5 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted"
                  >
                    {group.color && (
                      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: group.color }} />
                    )}
                    {group.label}
                  </div>
                  {group.options.map((option, j) => {
                    const i = offsets[g] + j;
                    return (
                      <div
                        key={option}
                        id={optionId(i)}
                        role="option"
                        aria-selected={option === value}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(i)}
                        style={{ minHeight: ROW_HEIGHT }}
                        className={`flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1 leading-snug ${
                          i === active ? "bg-subtle" : ""
                        }`}
                      >
                        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorFor(option) }} />
                        <span className="flex-1">{optionLabel(option)}</span>
                        {option === value && <CheckIcon className="h-4 w-4 shrink-0 text-accent" />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
