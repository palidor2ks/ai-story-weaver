import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    process.env.ANALYZE === "true" && visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true, open: !process.env.CI }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: "esbuild",
    rollupOptions: {
      output: {
        // Split large, infrequently-changing dependencies into their own long-cached
        // vendor chunks so users don't re-download them on every app deploy, and so the
        // heaviest libs aren't bundled into route chunks that need them only rarely.
        // Only EAGER deps (loaded on every page) belong here. recharts/xlsx are named so
        // they're deduped and cached, but they stay out of the initial load because nothing
        // in the eager graph imports them. papaparse/date-fns are intentionally NOT listed:
        // they're used only by lazy admin components, so Rollup keeps them in those lazy
        // chunks instead of being dragged into the eager bundle via a shared group.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "supabase": ["@supabase/supabase-js"],
          "react-query": ["@tanstack/react-query"],
          "charts": ["recharts"],
          "xlsx": ["xlsx"],
        },
      },
    },
  },
  esbuild: {
    // In production, strip debugger statements and noisy logs but keep console.error/warn
    // so real-user auth/network diagnostics still surface.
    drop: mode === "production" ? ["debugger"] : [],
    pure: mode === "production" ? ["console.log", "console.debug", "console.info"] : [],
  },
}));
