import { defineConfig } from "vite";

export default defineConfig({
  // For GitHub Pages: use "/<repo-name>/" (e.g. "/magicalmirai/")
  // For custom domain or local dev, use "./"
  // This is overridden by the GitHub Actions workflow via --base flag
  base: "./",
  root: ".",
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          textalive: ["textalive-app-api"],
        },
      },
    },
  },
  server: {
    open: true,
  },
});
