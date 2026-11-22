"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Ban, Gift, MessageCircle, MoreHorizontal, Send, Trash2, VolumeX, WifiOff } from "lucide-react";
import { blockUserAction, deleteChatMessageAction, muteChatUserAction, sendChatMessageAction } from "@/actions/social";
import { sendTipAction } from "@/actions/finance";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { idleState, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  kind: "message" | "tip" | "system";
  body: string;
  tipAmount: number | null;
  createdAt: string;
  sender: { id: string | null; username: string; role: "creator" | "customer" | "staff" | "system" };
};

type Access = { canWrite: boolean; canModerate: boolean; reason: string | null };

const TIP_PRESETS = [10, 25, 50, 100, 250];

/**
 * Chat einer Sitzung: Empfang über Server-Sent Events, Senden über Server Actions.
 * Inhalte werden ausschließlich als Text gerendert (kein HTML).
 */
export function ChatPanel({
  sessionId,
  viewerId,
  staffModeration = false,
  tip,
  title = "Chat",
  className,
}: {
  sessionId: string;
  viewerId: string;
  /** Mitarbeiter-Moderation (Begründung erforderlich). */
  staffModeration?: boolean;
  tip?: { min: number; max: number; enabled: boolean; currencyLabel: string } | null;
  title?: string;
  className?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [access, setAccess] = useState<Access | null>(null);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const source = new EventSource(`/api/sessions/${sessionId}/chat`);
    source.addEventListener("backlog", (event) => {
      const data = JSON.parse((event as MessageEvent<string>).data) as { messages: ChatMessage[]; access: Access };
      setMessages(data.messages);
      setAccess(data.access);
      setConnection("live");
    });
    source.addEventListener("message", (event) => {
      const message = JSON.parse((event as MessageEvent<string>).data) as ChatMessage;
      setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message].slice(-200)));
    });
    source.addEventListener("deleted", (event) => {
      const { id } = JSON.parse((event as MessageEvent<string>).data) as { id: string };
      setMessages((current) => current.filter((m) => m.id !== id));
    });
    source.onerror = () => setConnection("offline");
    source.onopen = () => setConnection("live");
    return () => source.close();
  }, [sessionId]);

  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  };

  return (
    <section className={cn("flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card", className)} aria-label={title}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-950">
          <MessageCircle className="size-4 text-brand-700" aria-hidden="true" /> {title}
        </h2>
        <span className={cn("flex items-center gap-1.5 text-xs", connection === "live" ? "text-success-700" : "text-ink-500")} aria-live="polite">
          {connection === "offline" ? <WifiOff className="size-3.5" aria-hidden="true" /> : <span className={cn("size-1.5 rounded-full", connection === "live" ? "bg-success-600" : "bg-ink-400")} />}
          {connection === "live" ? "verbunden" : connection === "connecting" ? "verbinde …" : "Verbindung unterbrochen – neuer Versuch …"}
        </span>
      </header>
      <ol ref={listRef} onScroll={onScroll} className="flex-1 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? <li className="py-8 text-center text-sm text-ink-500">Noch keine Nachrichten.</li> : null}
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} sessionId={sessionId} viewerId={viewerId} canModerate={!!access?.canModerate} staffModeration={staffModeration} />
        ))}
      </ol>
      <footer className="space-y-3 border-t border-line p-3">
        {access && !access.canWrite ? <p className="text-xs text-ink-500">{access.reason ?? "Du kannst in diesem Chat nicht schreiben."}</p> : null}
        {access?.canWrite ? <ComposeForm sessionId={sessionId} /> : null}
        {tip?.enabled && access?.canWrite ? <TipForm sessionId={sessionId} tip={tip} /> : null}
      </footer>
    </section>
  );
}

function MessageRow({
  message,
  sessionId,
  viewerId,
  canModerate,
  staffModeration,
}: {
  message: ChatMessage;
  sessionId: string;
  viewerId: string;
  canModerate: boolean;
  staffModeration: boolean;
}) {
  const own = message.sender.id === viewerId;
  if (message.kind === "system") {
    return <li className="py-1 text-center text-xs text-ink-500">{message.body}</li>;
  }
  const time = new Date(message.createdAt).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vienna" });
  return (
    <li className={cn("group relative rounded-xl px-3 py-2 text-sm", message.kind === "tip" ? "border border-brand-300 bg-brand-50" : own ? "bg-surface-2" : "bg-transparent hover:bg-surface-2")}>
      <div className="flex items-baseline gap-2 pr-8">
        <span className={cn("font-semibold", message.sender.role === "creator" ? "text-brand-700" : message.sender.role === "staff" ? "text-info-700" : "text-ink-900")}>
          {message.sender.username}
          {message.sender.role === "creator" ? <span className="ml-1 text-[0.65rem] font-medium uppercase tracking-wide text-brand-600">Creator</span> : null}
          {message.sender.role === "staff" ? <span className="ml-1 text-[0.65rem] font-medium uppercase tracking-wide">Team</span> : null}
        </span>
        <time className="text-[0.7rem] text-ink-500" dateTime={message.createdAt}>
          {time}
        </time>
      </div>
      {message.kind === "tip" ? (
        <p className="mt-0.5 flex items-center gap-1.5 font-medium text-brand-800">
          <Gift className="size-4" aria-hidden="true" /> {message.tipAmount} Münzen Trinkgeld
          {message.body && !/^\d+ Münzen Trinkgeld$/.test(message.body) ? <span className="font-normal text-ink-800">– {message.body}</span> : null}
        </p>
      ) : (
        <p className="mt-0.5 break-words whitespace-pre-wrap text-ink-800">{message.body}</p>
      )}
      {!own && message.sender.id ? (
        <details className="absolute top-1.5 right-1.5">
          <summary className="grid size-7 cursor-pointer list-none place-items-center rounded-md text-ink-500 opacity-60 hover:bg-ink-100 hover:opacity-100 focus-visible:opacity-100 [&::-webkit-details-marker]:hidden" aria-label="Aktionen zur Nachricht">
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-56 space-y-1 rounded-xl border border-line bg-surface-2 p-2 shadow-lift">
            <ReportDialog targetType="chat_message" targetId={message.id} targetLabel="Nachricht" signedIn triggerLabel="Melden" />
            <MiniAction action={blockUserAction} fields={{ userId: message.sender.id }} label="Blockieren" icon={<Ban className="size-4" aria-hidden="true" />} />
            {canModerate ? (
              <>
                <MiniAction action={deleteChatMessageAction} fields={{ messageId: message.id }} label="Löschen" icon={<Trash2 className="size-4" aria-hidden="true" />} reason={staffModeration} />
                <MiniAction action={muteChatUserAction} fields={{ sessionId, userId: message.sender.id, minutes: "30" }} label="30 Min. stummschalten" icon={<VolumeX className="size-4" aria-hidden="true" />} reason={staffModeration} />
              </>
            ) : null}
          </div>
        </details>
      ) : null}
    </li>
  );
}

function MiniAction({
  action,
  fields,
  label,
  icon,
  reason,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  icon: React.ReactNode;
  reason?: boolean;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const toast = useToast();
  useEffect(() => {
    if (state.status === "success" && state.message) toast.show({ tone: "success", message: state.message });
    if (state.status === "error" && state.message) toast.show({ tone: "error", message: state.message });
  }, [state, toast]);
  return (
    <form action={formAction} className="space-y-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {reason ? <input name="reason" required minLength={10} placeholder="Begründung (Pflicht)" className="h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-xs text-ink-900" /> : null}
      <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink-800 hover:bg-ink-100">
        {icon} {label}
      </button>
    </form>
  );
}

function ComposeForm({ sessionId }: { sessionId: string }) {
  const [state, formAction] = useActionState(sendChatMessageAction, idleState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="flex gap-2">
        <label htmlFor={`chat-input-${sessionId}`} className="sr-only">
          Nachricht
        </label>
        <input
          id={`chat-input-${sessionId}`}
          name="body"
          required
          maxLength={1000}
          autoComplete="off"
          placeholder="Nachricht schreiben …"
          className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:shadow-glow focus:outline-none"
        />
        <SubmitButton size="icon" aria-label="Senden" icon={<Send className="size-4" aria-hidden="true" />} />
      </div>
      {state.status === "error" ? <FormMessage state={state} /> : null}
    </form>
  );
}

function TipForm({ sessionId, tip }: { sessionId: string; tip: { min: number; max: number; currencyLabel: string } }) {
  const [state, formAction] = useActionState(sendTipAction, idleState);
  const requestIdRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState(Math.max(tip.min, 25));
  const toast = useToast();
  useEffect(() => {
    if (state.status === "success" && state.message) toast.show({ tone: "success", message: state.message });
  }, [state, toast]);
  const presets = TIP_PRESETS.filter((p) => p >= tip.min && p <= tip.max);
  return (
    <details className="rounded-xl border border-line bg-surface-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-brand-700 [&::-webkit-details-marker]:hidden">
        <Gift className="size-4" aria-hidden="true" /> Trinkgeld senden
      </summary>
      <form
        action={formAction}
        // Neue Anfrage-ID je Absenden: Doppelklicks/Wiederholungen derselben Anfrage buchen nur einmal.
        onSubmit={() => {
          if (requestIdRef.current) requestIdRef.current.value = crypto.randomUUID();
        }}
        className="space-y-3 px-3 pb-3"
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <input ref={requestIdRef} type="hidden" name="requestId" defaultValue="" />
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Betrag">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={amount === preset}
              onClick={() => setAmount(preset)}
              className={cn("h-9 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset", amount === preset ? "bg-brand-600 text-white ring-brand-600" : "bg-surface text-ink-800 ring-line-strong hover:ring-brand-300")}
            >
              {preset}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor={`tip-amount-${sessionId}`}>
            Betrag in Münzen
          </label>
          <input
            id={`tip-amount-${sessionId}`}
            name="amount"
            type="number"
            min={tip.min}
            max={tip.max}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="h-10 w-28 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink-900"
          />
          <input name="message" maxLength={120} placeholder="Nachricht (optional)" className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400" />
        </div>
        <SubmitButton size="sm" icon={<Gift className="size-4" aria-hidden="true" />}>
          {amount} {tip.currencyLabel} senden
        </SubmitButton>
        <p className="text-[0.7rem] text-ink-500">Trinkgelder sind freiwillig und nicht erstattbar, außer bei Missbrauch oder Fehlern.</p>
        {state.status === "error" ? <FormMessage state={state} /> : null}
      </form>
    </details>
  );
}
