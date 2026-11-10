/**
 * Video calls behind one interface (CLAUDE.md §2: Agora today). The rest of
 * the consultation module never talks to Agora directly.
 */
export interface VideoRoom {
  /** Provider-side channel/room name. */
  channel: string;
}

export interface VideoToken {
  appId: string;
  channel: string;
  token: string;
  uid: number;
  expiresAt: Date;
}

export abstract class VideoProvider {
  /** False when the credentials are not configured. */
  abstract readonly isConfigured: boolean;

  /** A room for one consultation (deterministic, so retries reuse it). */
  abstract createRoom(consultationId: string): VideoRoom;

  /** A short-lived token that lets `uid` publish and subscribe in `channel`. */
  abstract issueToken(channel: string, uid: number): VideoToken;

  /** Called when the consultation ends; tokens simply expire with Agora. */
  abstract endRoom(channel: string): Promise<void>;
}
