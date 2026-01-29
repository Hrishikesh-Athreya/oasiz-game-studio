import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ command }) => {
    return {
        plugins: [viteSingleFile()],
        build: {
            target: "esnext",
            minify: true,
            // Ensure everything is inlined into a single file
            assetsInlineLimit: 100000000,
            cssCodeSplit: false,
            rollupOptions: {
                output: {
                    inlineDynamicImports: true,
                },
            },
        },
        // Suppress noise during build, but keep dev server logs visible.
        logLevel: command === "build" ? "warn" : "info",
    };
});
