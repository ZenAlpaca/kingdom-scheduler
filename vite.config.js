import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vercel builds this with `vite build` and serves /api/* as serverless
// functions alongside the static site — no extra config needed for that
// part. This file only configures the frontend build.
export default defineConfig({
  plugins: [react()],
});
