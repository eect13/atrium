import { parseICS } from "./ics";

const scope = self as unknown as {
  addEventListener: (type: "message", fn: (e: MessageEvent<string>) => void) => void;
  postMessage: (msg: unknown) => void;
};

scope.addEventListener("message", (event) => {
  try {
    scope.postMessage({ ok: true, events: parseICS(event.data) });
  } catch (err) {
    scope.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : "parse",
    });
  }
});
