import { createRoot } from "react-dom/client";
import "./index.css";

// Build-time config the app cannot start without. Vite bakes these in during
// `npm run build`; if the build machine had no .env.production (or matching
// environment variables), they come through empty and Supabase throws at import,
// which used to leave a blank screen with no explanation.
const REQUIRED_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const;

const root = createRoot(document.getElementById("root")!);
const missing = REQUIRED_ENV.filter((key) => !import.meta.env[key]);

if (missing.length > 0) {
  root.render(
    <div
      role="alert"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        color: "#f1f5f9",
        background: "#0f1015",
      }}
    >
      <strong style={{ fontSize: 18 }}>The Captain could not start</strong>
      <span style={{ fontSize: 14, opacity: 0.8 }}>
        This build is missing its configuration: {missing.join(", ")}. Add these
        variables to the build environment and rebuild.
      </span>
    </div>,
  );
} else {
  // Loaded only after the check, so a missing variable can't crash the app before it renders.
  import("./App.tsx").then(({ default: App }) => root.render(<App />));
}
