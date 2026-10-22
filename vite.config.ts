import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "local-dev-csp",
      transformIndexHtml(html, context) {
        return context.server
          ? html.replace(
              "script-src 'self'",
              "script-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5173",
            )
          : html;
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    strictPort: true,
  },
});
