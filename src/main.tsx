import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "./pwa/registerSW";

createRoot(document.getElementById("root")!).render(<App />);

// Guarded — refuses to register in dev/preview/iframe contexts.
void registerSW();
