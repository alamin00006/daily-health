import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';

import { realtimeEndpoints } from '@/api/consultations-endpoints';
import { API_BASE_URL } from '@/config/app-environment';
import {
  REALTIME_EVENTS,
  type CallRingingEvent,
  type ChatMessageEvent,
  type ConsultationUpdatedEvent,
} from '@/shared-contracts/realtime.contract';
import type { EmergencyRealtimeEvent } from '@/shared-contracts/emergency.contract';

/** The API origin ("http://10.0.2.2:3000"): Socket.io lives next to /api. */
const REALTIME_ORIGIN = API_BASE_URL.replace(/\/api\/v1$/, '');

interface RealtimeState {
  socket: Socket | null;
  connected: boolean;
}

/** The one Socket.io connection of the signed-in app. */
export const useRealtimeStore = create<RealtimeState>(() => ({ socket: null, connected: false }));

/** The call screen currently open (so a second ring does not stack another one). */
let openCallId: string | null = null;
export function setOpenCall(consultationId: string | null): void {
  openCallId = consultationId;
}

/**
 * Keeps a Socket.io connection while a registered user is signed in and the
 * app is in the foreground. Every (re)connect gets a fresh one-time ticket.
 * Server events refresh the matching queries; a ringing call opens the call screen.
 */
export function useRealtimeConnection(enabled: boolean): void {
  const client = useQueryClient();
  const clientRef = useRef(client);
  useEffect(() => {
    clientRef.current = client;
  });

  useEffect(() => {
    if (!enabled) return;
    const socket = io(REALTIME_ORIGIN, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionDelayMax: 15_000,
      auth: (cb) => {
        realtimeEndpoints
          .ticket()
          .then((t) => cb({ ticket: t.ticket }))
          .catch(() => cb({ ticket: '' }));
      },
    });
    const invalidate = (queryKey: readonly unknown[]) =>
      void clientRef.current.invalidateQueries({ queryKey });

    socket.on('realtime:ready', () => useRealtimeStore.setState({ connected: true }));
    socket.on('disconnect', () => useRealtimeStore.setState({ connected: false }));
    // A rejected ticket is closed by the server; try again a little later.
    socket.on('realtime:error', () => setTimeout(() => socket.connect(), 5_000));
    socket.on(REALTIME_EVENTS.CONSULTATION_UPDATED, (e: ConsultationUpdatedEvent) => {
      invalidate(['consultations']);
      invalidate(['consultation', e.consultationId]);
    });
    socket.on(REALTIME_EVENTS.CHAT_MESSAGE, (e: ChatMessageEvent) => {
      invalidate(['chat', e.message.conversationId]);
    });
    socket.on(REALTIME_EVENTS.QUICK_QUEUE_CHANGED, () => invalidate(['quick-queue']));
    socket.on(REALTIME_EVENTS.EMERGENCY_UPDATED, (e: EmergencyRealtimeEvent) =>
      invalidate(['profile', e.profileId, 'emergency'])
    );
    socket.on(REALTIME_EVENTS.CALL_RINGING, (e: CallRingingEvent) => {
      invalidate(['consultation', e.consultationId]);
      if (openCallId === e.consultationId) return;
      router.push({
        pathname: '/consultations/[consultationId]/call',
        params: { consultationId: e.consultationId, incoming: '1', caller: e.callerName },
      });
    });
    useRealtimeStore.setState({ socket });

    // Back from the background: reconnect right away instead of waiting for the backoff.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !socket.connected) socket.connect();
    });

    return () => {
      appState.remove();
      socket.removeAllListeners();
      socket.close();
      useRealtimeStore.setState({ socket: null, connected: false });
    };
  }, [enabled]);
}

/** Runs `handler` for a server event while the component is mounted. */
export function useRealtimeEvent<T>(event: string, handler: (payload: T) => void): void {
  const socket = useRealtimeStore((s) => s.socket);
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
