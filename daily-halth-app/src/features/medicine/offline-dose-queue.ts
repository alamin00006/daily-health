import { isApiError } from '@/api/api-error';
import { medicineEndpoints } from '@/api/medicine-endpoints';
import { readJson, writeJson } from '@/lib/local-key-value-store';
import type { RecordDoseRequest } from '@/shared-contracts/medicine.contract';

import { cancelSnoozedAlarm } from './dose-alarm-scheduler';

const STORAGE_KEY = 'offline-dose-queue';

interface QueuedDose {
  profileId: string;
  body: RecordDoseRequest;
}

/** Same dose, latest choice wins (taken, then undone offline → only the undo is sent). */
function sameDose(a: QueuedDose, b: QueuedDose): boolean {
  return (
    a.profileId === b.profileId &&
    a.body.planId === b.body.planId &&
    a.body.scheduledFor === b.body.scheduledFor
  );
}

/**
 * Dose choices made without internet (the alarm rings offline too). They are
 * kept on the phone with the time they were made and sent when the app is
 * online again. The API accepts them later because doses are identified by
 * plan + time, not by a server id.
 */
export async function queueDose(profileId: string, body: RecordDoseRequest): Promise<void> {
  const entry: QueuedDose = {
    profileId,
    body: { ...body, actedAt: body.actedAt ?? new Date().toISOString() },
  };
  const queue = (await readJson<QueuedDose[]>(STORAGE_KEY)) ?? [];
  await writeJson(STORAGE_KEY, [...queue.filter((item) => !sameDose(item, entry)), entry]);
}

/** Sends now if online, otherwise keeps it for later. Throws only for real rejections. */
export async function recordDoseOrQueue(
  profileId: string,
  body: RecordDoseRequest
): Promise<{ queued: boolean }> {
  if (body.status === 'TAKEN' || body.status === 'SKIPPED') {
    // Local only, so it also works offline; a failure must not block recording the dose.
    await cancelSnoozedAlarm(body.planId, body.scheduledFor).catch(() => undefined);
  }
  try {
    await medicineEndpoints.recordDose(profileId, body);
    return { queued: false };
  } catch (error) {
    if (isApiError(error) && error.isConnectivityProblem) {
      await queueDose(profileId, body);
      return { queued: true };
    }
    throw error;
  }
}

/** Another account logs in on this phone: earlier choices are not theirs to send. */
export async function clearDoseQueue(): Promise<void> {
  await writeJson(STORAGE_KEY, []);
}

export async function pendingDoseCount(): Promise<number> {
  return ((await readJson<QueuedDose[]>(STORAGE_KEY)) ?? []).length;
}

let flushing: Promise<number> | null = null;

/** Sends what was queued; returns how many were sent. Stops at the first connectivity failure. */
export function flushDoseQueue(): Promise<number> {
  flushing ??= (async () => {
    try {
      const queue = (await readJson<QueuedDose[]>(STORAGE_KEY)) ?? [];
      const remaining: QueuedDose[] = [];
      let sent = 0;
      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index]!;
        try {
          await medicineEndpoints.recordDose(item.profileId, item.body);
          sent += 1;
        } catch (error) {
          if (isApiError(error) && (error.isConnectivityProblem || error.status >= 500)) {
            // Still offline: keep this and everything after it for next time.
            remaining.push(...queue.slice(index));
            break;
          }
          // Rejected for good (plan deleted, access removed): drop it.
        }
      }
      await writeJson(STORAGE_KEY, remaining);
      return sent;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
