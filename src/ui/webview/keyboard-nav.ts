/**
 * Keyboard Navigation — section list arrow-key traversal and ARIA attributes.
 *
 * Exports pure functions for processing keyboard events on the section list
 * and generating ARIA attributes for accessibility. No DOM manipulation here —
 * callers apply the returned data to the DOM.
 */

// ─── Types ─────────────────────────────────────────────────────────────

export interface KeyboardNavState {
  readonly focusedIndex: number;
  readonly sectionCount: number;
}

export interface KeydownResult {
  readonly newIndex: number;
  readonly action?: "select";
}

// ─── Keyboard Event Handler ────────────────────────────────────────────

/**
 * Process a keyboard event on the section list, returning the new focused
 * index and optional action, or null if the key is unhandled.
 *
 * Behavior:
 * - ArrowDown → next section (bounded, no wrap)
 * - ArrowUp → previous section (bounded, no wrap)
 * - Enter → select the currently focused section
 * - Any other key → null (unhandled)
 *
 * @param event - The keyboard event (only `key` is inspected).
 * @param state - Current navigation state (focusedIndex and sectionCount).
 * @returns New index with optional action, or null if the key was not handled.
 */
export function handleSectionListKeyDown(
  event: KeyboardEvent,
  state: KeyboardNavState
): KeydownResult | null {
  if (state.sectionCount === 0) {
    return null;
  }

  switch (event.key) {
    case "ArrowDown": {
      const newIndex = Math.min(state.focusedIndex + 1, state.sectionCount - 1);
      return { newIndex };
    }
    case "ArrowUp": {
      const newIndex = Math.max(state.focusedIndex - 1, 0);
      return { newIndex };
    }
    case "Enter": {
      return { newIndex: state.focusedIndex, action: "select" };
    }
    default:
      return null;
  }
}

// ─── ARIA Attributes ───────────────────────────────────────────────────

/**
 * Generate ARIA attributes for the section list container.
 *
 * The container uses `role="listbox"` to communicate its purpose to
 * assistive technologies. `tabindex="0"` makes it focusable.
 */
export function sectionListAriaAttrs(): Record<string, string> {
  return {
    role: "listbox",
    tabindex: "0",
    "aria-label": "Section list",
  };
}

/**
 * Generate ARIA attributes for a section list item.
 *
 * Each item uses `role="option"` with `aria-selected` to indicate
 * whether it is the currently selected/focused item.
 *
 * @param index - Zero-based index of the item in the list.
 * @param isSelected - Whether this item is currently selected/focused.
 */
export function sectionItemAriaAttrs(
  index: number,
  isSelected: boolean
): Record<string, string> {
  return {
    role: "option",
    "aria-selected": String(isSelected),
    id: `section-item-${index}`,
  };
}
