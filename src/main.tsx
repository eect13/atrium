import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AtriumApp } from "./components/atrium-app";
import { Providers } from "./components/providers";
import { AuthProvider } from "./lib/auth/provider";
import { parseFloatHash } from "./lib/native-float";
import { FloatShell } from "./components/float-shell";
import "./styles.css";

const el = document.getElementById("atrium-root");
if (!el) {
  throw new Error("Atrium: #atrium-root missing");
}

const flo = parseFloatHash();

createRoot(el).render(
  <StrictMode>
    <AuthProvider>
      <Providers>{flo ? <FloatShell kind={flo.kind} id={flo.id} /> : <AtriumApp />}</Providers>
    </AuthProvider>
  </StrictMode>,
);
