"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon } from "./icons";
import { colorFor } from "@/lib/format";

interface Props {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  /** Accessible name, e.g. "Category for GRAB*FOOD". */
  label: string;
  /** Display name of an option (e.g. a translated category name); the values stay as they are. */
  optionLabel?: (value: string) => string;
}

const MENU_GAP = 4;
const MENU_WIDTH = 176;
const ROW_HEIGHT = 34;

type Position = { left: number; top?: number; bottom?: number };

/**
 * A pill button that opens a listbox popover (ARIA "button + listbox" pattern).
 * The popover is portalled to <body> with fixed positioning, so a scrolling table never clips it;
 * it flips upward when there is no room below the trigger.
 */
export default function CategoryPicker({ value, options, onChange, label, optionLabel = (v) => v }: Props) {
  const id = useId();
  const labelId = `${id}-label`;
  const buttonId = `${id}-button`;
  const listId = `${id}-list`;
  const all = options.includes(value) ? options : [value, ...options];

  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Position | null>(null);

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = all.length * ROW_HEIGHT + 8;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
    const below = window.innerHeight - rect.bottom;
    if (below < menuHeight + MENU_GAP && rect.top > below) {
      setPos({ left, bottom: window.innerHeight - rect.top + MENU_GAP });
    } else {
      setPos({ left, top: rect.bottom + MENU_GAP });
    }
  }, [all.length]);

  const openMenu = (index = Math.max(0, all.indexOf(value))) => {
    setActive(index);
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

  function onListKey(e: KeyboardEvent<HTMLUListElement>) {
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
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
      case "Tab":
        e.preventDefault();
        close(true);
        break;
      default:
        // Type-ahead by first letter; repeated presses cycle through matches.
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const key = e.key.toLowerCase();
          for (let step = 1; step <= all.length; step++) {
            const i = (active + step) % all.length;
            if (optionLabel(all[i]).toLowerCase().startsWith(key)) {
              setActive(i);
              break;
            }
          }
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
        className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-2.5 pr-1.5 text-sm capitalize text-ink transition-colors duration-150 hover:border-line-strong"
      >
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorFor(value) }} />
        {optionLabel(value)}
        <ChevronDownIcon className={`h-3.5 w-3.5 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={labelId}
            aria-activedescendant={`${id}-opt-${active}`}
            onKeyDown={onListKey}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (next !== buttonRef.current && !listRef.current?.contains(next)) setOpen(false);
            }}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_WIDTH }}
            className={`fixed z-50 rounded-lg border border-line bg-surface p-1 text-sm text-ink shadow-pop outline-none animate-pop-in ${
              pos.bottom !== undefined ? "origin-bottom" : "origin-top"
            }`}
          >
            {all.map((option, i) => (
              <li
                key={option}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={option === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                style={{ height: ROW_HEIGHT }}
                className={`flex cursor-pointer select-none items-center gap-2 rounded-md px-2 capitalize ${
                  i === active ? "bg-subtle" : ""
                }`}
              >
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorFor(option) }} />
                <span className="flex-1">{optionLabel(option)}</span>
                {option === value && <CheckIcon className="h-4 w-4 text-accent" />}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
