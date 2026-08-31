"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  MAX_TAGS,
  MAX_TAG_LENGTH,
  parseTagsInput,
} from "@/lib/journalMeta";
import settingsStyles from "@/components/settings/settings.module.css";
import listStyles from "@/components/profiles/ProfileList.module.css";

/**
 * The Details tab's tag editor: free-form, comma-separated tags on the
 * profile ("family", "clients", "class of '99") — installation metadata,
 * PATCHed without ever versioning the chart. The profile list filters by
 * them.
 */
export default function TagsEditor({
  profileId,
  tags,
}: {
  profileId: number;
  tags: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tags.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = parseTagsInput(value);
    if (parsed.length > MAX_TAGS) {
      setError(`At most ${MAX_TAGS} tags.`);
      return;
    }
    if (parsed.some((t) => t.length > MAX_TAG_LENGTH)) {
      setError(`Tags are capped at ${MAX_TAG_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/profiles/${profileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: parsed }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Could not save — is the server running?");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <p>
        {tags.length === 0 ? (
          <span className={settingsStyles.note}>No tags. </span>
        ) : (
          <span className={listStyles.chips} style={{ display: "inline-flex" }}>
            {tags.map((t) => (
              <span key={t} className={listStyles.tagBadge}>
                #{t}
              </span>
            ))}{" "}
          </span>
        )}
        <button
          className={settingsStyles.reset}
          onClick={() => {
            setValue(tags.join(", "));
            setEditing(true);
          }}
        >
          {tags.length === 0 ? "Add tags" : "Edit tags"}
        </button>
      </p>
    );
  }

  return (
    <div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="family, clients, book club…"
        aria-label="Tags, comma-separated"
        style={{ minWidth: "16rem" }}
      />{" "}
      <button className={settingsStyles.reset} onClick={() => void save()} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>{" "}
      <button
        className={settingsStyles.reset}
        onClick={() => setEditing(false)}
        disabled={busy}
      >
        Cancel
      </button>
      {error && (
        <p className={settingsStyles.note} role="alert">
          {error}
        </p>
      )}
      <p className={settingsStyles.note}>
        Comma-separated; tags are lowercased and deduplicated. The profile
        list grows filter chips for them.
      </p>
    </div>
  );
}
