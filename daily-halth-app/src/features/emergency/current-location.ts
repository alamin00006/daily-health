import * as Location from 'expo-location';

export interface Position {
  lat: number;
  lng: number;
}

export interface SosLocation {
  /** Known within a few seconds (fresh fix or a recent last-known one), else null. */
  quick: Position | null;
  /** A fresh GPS fix that may come later (up to a minute); null without permission. */
  later: Promise<Position | null> | null;
}

const QUICK_WAIT_MS = 5_000;
const LATER_WAIT_MS = 60_000;

function round(position: Location.LocationObject): Position {
  return {
    lat: Math.round(position.coords.latitude * 1e6) / 1e6,
    lng: Math.round(position.coords.longitude * 1e6) / 1e6,
  };
}

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * Location for an SOS without holding the SOS back: whatever is known within
 * 5 seconds goes with the request; a fresh GPS fix that arrives later is sent
 * after it (the system's permission and accuracy dialogs can take a while).
 */
export async function sosLocation(): Promise<SosLocation> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { quick: null, later: null };
    const fresh = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      .then(round)
      .catch(() => null);
    const quickFix = await within(fresh, QUICK_WAIT_MS);
    if (quickFix) return { quick: quickFix, later: null };
    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }).catch(() => null);
    return { quick: lastKnown ? round(lastKnown) : null, later: lastKnown ? null : within(fresh, LATER_WAIT_MS) };
  } catch {
    return { quick: null, later: null };
  }
}
