import { setStore } from './core';

let notificationTimer: ReturnType<typeof setTimeout> | null = null;
/** Ongoing work with no known end; shown whenever no timed notice is up. */
let progressMessage: string | null = null;

export const NOTIFICATION_DEFAULT_MS = 3000;
/** Errors the user must act on stay up longer than a passing status message. */
export const NOTIFICATION_ERROR_MS = 10_000;

export function showNotification(message: string, opts?: { durationMs?: number }): void {
  if (notificationTimer) clearTimeout(notificationTimer);
  setNotice(message, false);
  notificationTimer = setTimeout(() => {
    setNotice(progressMessage, progressMessage !== null);
    notificationTimer = null;
  }, opts?.durationMs ?? NOTIFICATION_DEFAULT_MS);
}

/** Sets (or with null, ends) a notice that stays up until the work it
 *  describes finishes. Timed notices show over it and then give way back. */
export function showProgressNotification(message: string | null): void {
  progressMessage = message;
  if (!notificationTimer) setNotice(message, message !== null);
}

export function clearNotification(): void {
  if (notificationTimer) clearTimeout(notificationTimer);
  notificationTimer = null;
  // A dismissed progress notice returns with its next update.
  progressMessage = null;
  setNotice(null, false);
}

/** `busy` marks ongoing work, so the notice shows a spinner. */
function setNotice(message: string | null, busy: boolean): void {
  setStore('notification', message);
  setStore('notificationBusy', busy);
}
