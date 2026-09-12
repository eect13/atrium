import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

const el = document.getElementById("atrium-root");
if (!el) {
  throw new Error("Atrium: #atrium-root missing");
}

createRoot(el).render(
  <StrictMode>
    <RouterProvider router={getRouter()} />
  </StrictMode>,
);
