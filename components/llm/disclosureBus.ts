"use client";

import { acknowledgeLlm, hasAcknowledgedLlm } from "@/lib/llmDisclosure";

/**
 * Same-tab bus for the first-generation disclosure, mirroring
 * components/undo/undoBus: the dialog is mounted once in the root layout and
 * every generate button asks it through here, so no panel needs to own the
 * modal or know it exists.
 */

export const LLM_DISCLOSURE_EVENT = "astralsync:llm-disclosure";

export interface DisclosureRequest {
  /** Resolve true to proceed with generation, false to cancel. */
  decide: (proceed: boolean) => void;
}

/**
 * Resolve once the user may generate. Returns immediately when they have
 * already been told; otherwise raises the dialog and waits for a decision.
 * Returns false if the user declines, so the caller can abandon quietly.
 */
export function ensureLlmDisclosed(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  if (hasAcknowledgedLlm()) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const decide = (proceed: boolean) => {
      if (settled) return;
      settled = true;
      if (proceed) acknowledgeLlm();
      resolve(proceed);
    };
    // A missing listener (the dialog failed to mount) must not silently
    // block generation. The dialog calls preventDefault to claim the
    // request; dispatchEvent then returns false and we wait for it.
    const event = new CustomEvent<DisclosureRequest>(LLM_DISCLOSURE_EVENT, {
      detail: { decide },
      cancelable: true,
    });
    const claimed = !window.dispatchEvent(event);
    if (!claimed) decide(true);
  });
}
