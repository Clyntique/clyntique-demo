"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { sendMessageAction, type MessageFormState } from "@/lib/messages/actions";
import { MESSAGE_MAX_LENGTH } from "@/lib/messages/limits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { FormError } from "@/components/forms/form-error";

/*
 * Composer for a conversation. With a conversationId it replies in it; a
 * client without one (first message about a submission) passes creativeId
 * instead and the server opens the conversation, or continues the existing one.
 */
export function ReplyForm({
  conversationId,
  creativeId,
  placeholder = "Write a message…",
  label = "Message",
  redirectTo,
}: {
  conversationId?: string;
  creativeId?: string;
  placeholder?: string;
  label?: string;
  /** Where to go after the first message opened a new conversation (base path + "/messages"). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<MessageFormState, FormData>(sendMessageAction, undefined);

  useEffect(() => {
    if (!state?.sent) return;
    formRef.current?.reset();
    if (redirectTo && state.conversationId) router.push(`${redirectTo}/${state.conversationId}`);
  }, [state?.sent, state?.conversationId, redirectTo, router]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      {conversationId && <input type="hidden" name="conversationId" value={conversationId} />}
      {creativeId && <input type="hidden" name="creativeId" value={creativeId} />}
      <FormError message={state?.error} />
      <label className="sr-only" htmlFor={`msg-${conversationId ?? creativeId ?? "new"}`}>
        {label}
      </label>
      <Textarea
        id={`msg-${conversationId ?? creativeId ?? "new"}`}
        name="body"
        required
        maxLength={MESSAGE_MAX_LENGTH}
        rows={3}
        className="min-h-20"
        placeholder={placeholder}
        defaultValue={state?.error ? state.body : undefined}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-muted">Messages can&apos;t be edited once sent.</p>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
