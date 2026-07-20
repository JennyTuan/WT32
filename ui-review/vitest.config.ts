import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "simple-ime": fileURLToPath(new URL("./node_modules/simple-ime/dist/simple-ime.es.js", import.meta.url)),
        },
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        clearMocks: true,
        restoreMocks: true,
    },
});
