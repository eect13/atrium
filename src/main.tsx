import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { parseFloatHash } from "./lib/native-float";
import { restoreStateFromFile } from "./lib/state-file";
import "./styles.css";

const el = document.getElementById("atrium-root");
if (!el) {
  throw new Error("Atrium: #atrium-root missing");
}
const root = el;

const flo = parseFloatHash();
// Card 228: the shared desktop ⋯ popup window (Rust pre-creates it hidden). No store, no restore.
const menuWindow = new URLSearchParams(location.search).get("float") === "menu";

// Card 208: main restores atrium.v1 from the app-data file (when newer) before the store is
// created, so the app modules that create it load only after that.
async function boot() {
  if (menuWindow) {
    const { MenuWindow } = await import("./components/menu-window");
    createRoot(root).render(<MenuWindow />);
    return;
  }
  if (!flo) await restoreStateFromFile();
  const [{ AtriumApp }, { Providers }, { AuthProvider }, { FloatShell }] = await Promise.all([
    import("./components/atrium-app"),
    import("./components/providers"),
    import("./lib/auth/provider"),
    import("./components/float-shell"),
  ]);
  createRoot(root).render(
    <StrictMode>
      <AuthProvider>
        <Providers>{flo ? <FloatShell kind={flo.kind} id={flo.id} /> : <AtriumApp />}</Providers>
      </AuthProvider>
    </StrictMode>,
  );
}

void boot();
