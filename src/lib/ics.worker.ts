import { parseICS } from "./ics";
import { setDeskZone } from "./format";

const scope = self as unknown as {
  addEventListener: (type: "message", fn: (e: MessageEvent<string | { text?: string; tz?: string }>) => void) => void;
  postMessage: (msg: unknown) => void;
};

scope.addEventListener("message", (event) => {
  try {
    const data = typeof event.data === "string" ? { text: event.data, tz: "" } : event.data;
    if (data?.tz) setDeskZone({ tz: data.tz });
    scope.postMessage({ ok: true, events: parseICS(data?.text ?? "") });
  } catch (err) {
    scope.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : "parse",
    });
  }
});
