"use client";

import { useState } from "react";
import { Select } from "@/components/ui/input";
import { ReplyForm } from "./reply-form";

// Pick what the message is about, then write it. The server opens the
// conversation for that subject, or continues the existing one.
export function NewMessageForm({
  subjects,
  initialCreativeId,
  redirectTo,
}: {
  subjects: { id: string; name: string }[];
  initialCreativeId: string;
  redirectTo: string;
}) {
  const [creativeId, setCreativeId] = useState(initialCreativeId);
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-small font-medium text-ink-soft">About</span>
        <Select value={creativeId} onChange={(e) => setCreativeId(e.target.value)}>
          <option value="">General question</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </label>
      {/* key: switching subject resets the form so the hidden field follows. */}
      <ReplyForm key={creativeId} creativeId={creativeId} redirectTo={redirectTo} label="Your message" placeholder="Ask your reviewer a question…" />
    </div>
  );
}
