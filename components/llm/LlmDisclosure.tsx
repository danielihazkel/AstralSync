"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DISCLOSURE_POINTS } from "@/lib/llmDisclosure";
import {
  LLM_DISCLOSURE_EVENT,
  type DisclosureRequest,
} from "./disclosureBus";
import styles from "./llmDisclosure.module.css";

/**
 * The first-generation disclosure, mounted once in the root layout beside
 * UndoToast. Every generate button reaches it through ensureLlmDisclosed();
 * it claims the request with preventDefault so the bus knows a dialog is
 * actually listening and never blocks generation when one isn't.
 *
 * Declining is a real answer: nothing is acknowledged, nothing is sent, and
 * the dialog asks again next time.
 */
export default function LlmDisclosure() {
  const [pending, setPending] = useState<DisclosureRequest | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Focus returns here on close — the button that asked.
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    function onAsk(e: Event) {
      const ce = e as CustomEvent<DisclosureRequest>;
      ce.preventDefault();
      returnTo.current = document.activeElement;
      setPending(ce.detail);
    }
    window.addEventListener(LLM_DISCLOSURE_EVENT, onAsk);
    return () => window.removeEventListener(LLM_DISCLOSURE_EVENT, onAsk);
  }, []);

  const settle = useCallback(
    (proceed: boolean) => {
      pending?.decide(proceed);
      setPending(null);
      const back = returnTo.current;
      if (back instanceof HTMLElement) back.focus();
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, settle]);

  if (!pending) return null;

  return (
    <>
      <div
        className={styles.backdrop}
        onClick={() => settle(false)}
        aria-hidden="true"
      />
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="llm-disclosure-title"
      >
        <h2 className={styles.title} id="llm-disclosure-title">
          Before the first AI reading
        </h2>
        <p className={styles.body}>
          Generating a reading sends the following to whichever model this
          install is pointed at:
        </p>
        <ul className={styles.points}>
          {DISCLOSURE_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className={styles.body}>
          That is deliberate — the reading is meant to be about you, not an
          anonymous chart. But it is also enough to identify you, so it is
          worth knowing where it goes. If this install points at a hosted
          API, that data leaves your machine; pointing{" "}
          <code>READING_LLM</code> at a local Ollama model keeps it here.
          Synastry readings are the exception and never include birth
          details for either person.
        </p>
        <p className={styles.body}>
          Everything else in AstralSync works offline and sends nothing.
          You&rsquo;ll only see this once.
        </p>
        <div className={styles.actions}>
          <button className={styles.secondary} onClick={() => settle(false)}>
            Not now
          </button>
          <button
            className={styles.primary}
            ref={confirmRef}
            onClick={() => settle(true)}
          >
            Got it — generate
          </button>
        </div>
      </div>
    </>
  );
}
