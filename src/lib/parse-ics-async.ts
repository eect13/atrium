import type { CalendarEvent } from "./types";
import { parseICS } from "./ics";
import IcsWorker from "./ics.worker.ts?worker";

const MIN_WORKER_BYTES = 16_000;

/** Parse ICS off the main thread for large files; small ones stay synchronous. */
export function parseICSAsync(text: string, timeoutMs = 8_000): Promise<CalendarEvent[]> {
  if (typeof window === "undefined" || typeof Worker === "undefined" || text.length < MIN_WORKER_BYTES) {
    return Promise.resolve(parseICS(text));
  }

  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new IcsWorker();
    } catch {
      resolve(parseICS(text));
      return;
    }

    let done = false;
    const finish = (events: CalendarEvent[]) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      try {
        worker.terminate();
      } catch {
        /* already dead */
      }
      resolve(events);
    };

    const timer = window.setTimeout(() => finish(parseICS(text)), timeoutMs);
    worker.addEventListener("message", (event: MessageEvent<{ ok?: boolean; events?: CalendarEvent[] }>) => {
      const payload = event.data;
      finish(payload?.ok && payload.events ? payload.events : parseICS(text));
    });
    worker.addEventListener("error", () => finish(parseICS(text)));
    worker.postMessage(text);
  });
}
