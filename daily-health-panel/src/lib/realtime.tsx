"use client";

import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api-client";
import type {
  ChatMessageEvent,
  ConsultationUpdatedEvent,
  RealtimeTicketResponse,
} from "@/shared-contracts/realtime.contract";
import { REALTIME_EVENTS } from "@/shared-contracts/realtime.contract";

/** Where the browser reaches Socket.io (the API host; in production behind the same domain). */
const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3000";

interface RealtimeContextValue {
  socket: Socket | null;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue>({ socket: null, connected: false });

/**
 * One Socket.io connection for the logged-in panel. The browser never sees the
 * API tokens (httpOnly cookies), so each (re)connect asks the BFF for a
 * one-time ticket. Server events refresh the matching queries.
 */
export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const client = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const next = io(REALTIME_URL, {
      path: "/socket.io",
      transports: ["websocket"],
      withCredentials: true,
      reconnectionDelayMax: 10_000,
      auth: (cb) => {
        api
          .post<RealtimeTicketResponse>("/realtime/ticket")
          .then((t) => cb({ ticket: t.ticket }))
          .catch(() => cb({ ticket: "" }));
      },
    });
    next.on("realtime:ready", () => setConnected(true));
    next.on("disconnect", () => setConnected(false));
    // A rejected ticket disconnects from the server side; try again shortly.
    next.on("realtime:error", () => setTimeout(() => next.connect(), 5_000));
    next.on(REALTIME_EVENTS.CONSULTATION_UPDATED, (e: ConsultationUpdatedEvent) => {
      void client.invalidateQueries({ queryKey: ["consultations"] });
      void client.invalidateQueries({ queryKey: ["consultation", e.consultationId] });
    });
    next.on(REALTIME_EVENTS.CHAT_MESSAGE, (e: ChatMessageEvent) => {
      void client.invalidateQueries({ queryKey: ["chat", e.message.conversationId] });
    });
    next.on(REALTIME_EVENTS.QUICK_QUEUE_CHANGED, () => {
      void client.invalidateQueries({ queryKey: ["quick-queue"] });
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the socket is an external system created here
    setSocket(next);
    return () => {
      next.removeAllListeners();
      next.close();
      setSocket(null);
      setConnected(false);
    };
  }, [enabled, client]);

  return <RealtimeContext.Provider value={{ socket, connected }}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

/** Runs `handler` for a server event while the component is mounted. */
export function useRealtimeEvent<T>(event: string, handler: (payload: T) => void): void {
  const { socket } = useRealtime();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => latest.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
