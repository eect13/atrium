import { useEffect, useState } from "react";

export function isAppleMod() {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform ?? "";
  const ua = navigator.userAgent ?? "";
  return /Mac|iPhone|iPad|iPod/.test(platform) || /Mac OS X/.test(ua);
}

export function modKeyHint() {
  return isAppleMod() ? "⌘K" : "Ctrl+K";
}

export function useModHint() {
  const [hint, setHint] = useState("Ctrl+K");
  useEffect(() => {
    setHint(modKeyHint());
  }, []);
  return hint;
}
