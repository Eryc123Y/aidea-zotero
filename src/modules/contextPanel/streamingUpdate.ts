/**
 * Streaming Update Module
 *
 * Provides incremental DOM updates during LLM streaming responses.
 * Instead of re-rendering the entire chat history on each token,
 * only the last assistant bubble is patched in place.
 */

import { renderMarkdown } from "../../utils/markdown";
import { sanitizeText } from "./textUtils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default throttle interval (ms) for streaming patch updates. */
const DEFAULT_PATCH_INTERVAL_MS = 30;

/** Default auto-scroll threshold (px from bottom). */
const DEFAULT_AUTO_SCROLL_THRESHOLD = 64;

// ---------------------------------------------------------------------------
// DOM Lookup
// ---------------------------------------------------------------------------

/**
 * Find the last assistant bubble inside the chatBox.
 * This is the bubble that `refreshChat` created for the streaming message
 * (which starts as a skeleton).
 *
 * Returns `null` if no assistant bubble exists.
 */
export function findLastAssistantBubble(
  chatBox: HTMLDivElement | null,
): HTMLDivElement | null {
  if (!chatBox) return null;
  const wrappers = chatBox.querySelectorAll(".llm-message-wrapper.assistant");
  if (!wrappers.length) return null;
  const lastWrapper = wrappers[wrappers.length - 1];
  return lastWrapper.querySelector(
    ".llm-bubble.assistant",
  ) as HTMLDivElement | null;
}

// ---------------------------------------------------------------------------
// Patch
// ---------------------------------------------------------------------------

/**
 * Incrementally update a streaming assistant bubble's content.
 *
 * On the first call (when the skeleton is still visible), the skeleton is
 * removed and a content container (`[data-streaming-content]`) is created.
 *
 * On subsequent calls, only the content container's `innerHTML` is updated
 * via `renderMarkdown`.
 *
 * If the bubble has been removed from the DOM (e.g. the user switched panels),
 * this function is a no-op.
 */
export function patchStreamingBubble(
  bubble: HTMLDivElement | null,
  text: string,
): void {
  if (!bubble || !bubble.parentNode) return;

  const safeText = sanitizeText(text);
  if (!safeText) return;

  // Remove skeleton on first real content
  const skeleton = bubble.querySelector(".llm-streaming-skeleton");
  if (skeleton) {
    skeleton.remove();
  }

  // Find or create a stable content container so we don't clobber the model
  // name element or any other structural children.
  let contentEl = bubble.querySelector(
    "[data-streaming-content]",
  ) as HTMLDivElement | null;
  if (!contentEl) {
    const doc = bubble.ownerDocument;
    if (!doc) return;
    contentEl = doc.createElement("div") as HTMLDivElement;
    contentEl.setAttribute("data-streaming-content", "true");
    bubble.appendChild(contentEl);
  }

  try {
    contentEl.innerHTML = renderMarkdown(safeText);
  } catch {
    contentEl.textContent = safeText;
  }
}

/**
 * Clean up a streaming bubble after the stream completes.
 *
 * - Removes the `streaming` CSS class (hides cursor animation)
 * - Removes any leftover skeleton
 */
export function finalizeStreamingBubble(
  bubble: HTMLDivElement | null,
): void {
  if (!bubble) return;
  bubble.classList.remove("streaming");
  const skeleton = bubble.querySelector(".llm-streaming-skeleton");
  if (skeleton) skeleton.remove();
}

// ---------------------------------------------------------------------------
// Throttle
// ---------------------------------------------------------------------------

/**
 * Create a throttled wrapper around a patch function.
 *
 * During streaming, `onDelta` fires very frequently. This helper ensures
 * we only perform a DOM update at most once every `intervalMs` milliseconds,
 * keeping the UI responsive without overwhelming the renderer.
 *
 * @param patchFn  The function that performs the actual DOM patch.
 * @param intervalMs  Minimum interval between consecutive patches (default 30ms).
 */
export function createQueuedStreamingPatch(
  patchFn: () => void,
  intervalMs: number = DEFAULT_PATCH_INTERVAL_MS,
): () => void {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      patchFn();
    }, intervalMs);
  };
}

// ---------------------------------------------------------------------------
// Auto-scroll
// ---------------------------------------------------------------------------

/**
 * If the chatBox is scrolled near the bottom (within `threshold` px),
 * snap to the very bottom. This keeps the latest streamed content in view
 * without fighting the user if they have scrolled up.
 */
export function autoScrollStreamingIfNeeded(
  chatBox: HTMLDivElement | null,
  threshold: number = DEFAULT_AUTO_SCROLL_THRESHOLD,
): void {
  if (!chatBox) return;
  const distanceFromBottom =
    chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight;
  if (distanceFromBottom <= threshold) {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}
