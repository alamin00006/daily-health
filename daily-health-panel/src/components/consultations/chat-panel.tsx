"use client";

import { clsx } from "clsx";
import { FileText, ImagePlus, Lock, SendHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, ErrorBox, Skeleton, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useConversation, useMarkRead, useMessages, useSendImage, useSendMessage } from "@/features/consultation-queries";
import { isApiError } from "@/lib/api-client";
import { banglaClock, dhakaTime } from "@/lib/format";
import { useRealtime, useRealtimeEvent } from "@/lib/realtime";
import type { MessageResponse } from "@/shared-contracts/chat.contract";
import { REALTIME_EVENTS, type ChatTypingEvent } from "@/shared-contracts/realtime.contract";

const TYPING_SHOWN_MS = 4_000;
const TYPING_SEND_EVERY_MS = 2_500;

/** The consultation chat: live messages, photos, typing and read state. */
export function ChatPanel({ conversationId, open, className }: { conversationId: string; open: boolean; className?: string }) {
  const toast = useToast();
  const conversation = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const sendImage = useSendImage(conversationId);
  const markRead = useMarkRead(conversationId);
  const { socket } = useRealtime();
  const [draft, setDraft] = useState("");
  const [typingAt, setTypingAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const lastTypingSent = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () => (messages.data?.pages.flatMap((p) => p.data) ?? []).slice().reverse(),
    [messages.data],
  );
  const newestId = rows.at(-1)?.id;
  const myRole = conversation.data?.myRole;

  useRealtimeEvent<ChatTypingEvent>(REALTIME_EVENTS.CHAT_TYPING, (e) => {
    if (e.conversationId === conversationId) setTypingAt(Date.now());
  });

  // Keep the "typing…" line honest without a timer per keystroke.
  useEffect(() => {
    if (!typingAt) return;
    const timer = setTimeout(() => setNow(Date.now()), TYPING_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [typingAt]);

  // New message: scroll down and mark it read.
  useEffect(() => {
    if (!newestId) return;
    bottom.current?.scrollIntoView({ block: "end" });
    if (document.visibilityState === "visible") markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per newest message
  }, [newestId]);

  function submit() {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(
      { clientMsgId: crypto.randomUUID(), body },
      {
        onSuccess: () => setDraft(""),
        onError: (e) => toast(isApiError(e) ? e.userMessage : "পাঠানো যায়নি", "error"),
      },
    );
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function onType(value: string) {
    setDraft(value);
    const at = Date.now();
    if (socket && at - lastTypingSent.current > TYPING_SEND_EVERY_MS) {
      lastTypingSent.current = at;
      socket.emit(REALTIME_EVENTS.CHAT_TYPING, { conversationId });
    }
  }

  function onPickImage(file: File | undefined) {
    if (!file) return;
    sendImage.mutate(
      { file, clientMsgId: crypto.randomUUID() },
      { onError: (e) => toast(isApiError(e) ? e.userMessage : "ছবি পাঠানো যায়নি", "error") },
    );
    if (fileInput.current) fileInput.current.value = "";
  }

  const otherTyping = typingAt > 0 && now - typingAt < TYPING_SHOWN_MS;

  return (
    <div className={clsx("flex min-h-0 flex-col rounded-2xl border border-line bg-white", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ml-auto h-12 w-1/2" />
            <Skeleton className="h-12 w-3/5" />
          </div>
        ) : messages.isError ? (
          <ErrorBox message={isApiError(messages.error) ? messages.error.userMessage : "বার্তা লোড হয়নি"} onRetry={() => void messages.refetch()} />
        ) : (
          <>
            {messages.hasNextPage ? (
              <div className="mb-3 text-center">
                <Button size="sm" variant="ghost" loading={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
                  আগের বার্তা
                </Button>
              </div>
            ) : null}
            <ul className="flex flex-col gap-2">
              {rows.map((m) => (
                <MessageBubble key={m.id} message={m} mine={m.senderRole !== "SYSTEM" && m.senderRole === myRole} />
              ))}
            </ul>
          </>
        )}
        <div ref={bottom} />
      </div>
      <div className="border-t border-line p-3">
        {otherTyping ? <p className="mb-1 px-1 text-xs text-muted">রোগী লিখছেন…</p> : null}
        {open ? (
          <div className="flex items-end gap-2">
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
            <button
              type="button"
              aria-label="ছবি পাঠান"
              onClick={() => fileInput.current?.click()}
              disabled={sendImage.isPending}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-primary hover:bg-mint disabled:opacity-50"
            >
              {sendImage.isPending ? <Spinner /> : <ImagePlus className="size-5" />}
            </button>
            <textarea
              rows={1}
              value={draft}
              maxLength={2000}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={onKey}
              placeholder="বার্তা লিখুন… (Enter চাপলে যাবে)"
              className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-line px-3 py-2.5 outline-none focus:border-primary"
            />
            <Button icon={SendHorizontal} loading={send.isPending} disabled={!draft.trim()} onClick={submit} aria-label="পাঠান">
              <span className="hidden sm:inline">পাঠান</span>
            </Button>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 py-2 text-sm text-muted">
            <Lock className="size-4" /> পরামর্শ শেষ; চ্যাট এখন শুধু পড়া যাবে
          </p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message: m, mine }: { message: MessageResponse; mine: boolean }) {
  const time = banglaClock(dhakaTime(m.createdAt));
  if (m.senderRole === "SYSTEM") {
    return (
      <li className="my-1 self-center rounded-full bg-surface px-3 py-1 text-center text-xs text-muted">
        {m.body} · {time}
      </li>
    );
  }
  if (m.type === "PRESCRIPTION" && m.refId) {
    return (
      <li className={clsx("flex max-w-[80%] flex-col gap-1", mine ? "self-end items-end" : "self-start items-start")}>
        <a href={`/prescriptions/${m.refId}`} className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-mint px-4 py-3 hover:bg-soft">
          <FileText className="size-5 text-primary" />
          <span className="font-semibold text-primary">{m.body}</span>
        </a>
        <span className="px-1 text-[11px] text-muted">{time}</span>
      </li>
    );
  }
  return (
    <li className={clsx("flex max-w-[80%] flex-col gap-1", mine ? "self-end items-end" : "self-start items-start")}>
      <div className={clsx("rounded-2xl px-3.5 py-2.5", mine ? "rounded-br-md bg-primary text-white" : "rounded-bl-md bg-mint text-ink")}>
        {m.attachment ? (
          <a href={m.attachment.url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL, not optimisable */}
            <img src={m.attachment.previewUrl ?? m.attachment.url} alt={m.body ?? "ছবি"} className="max-h-64 rounded-xl object-contain" />
          </a>
        ) : null}
        {m.body ? <p className={clsx("whitespace-pre-wrap break-words", m.attachment ? "mt-1.5" : "")}>{m.body}</p> : null}
      </div>
      <span className="px-1 text-[11px] text-muted">{time}</span>
    </li>
  );
}
