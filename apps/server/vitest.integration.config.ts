import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: "default",
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@postgres:5432/el_dorado",
    },
  },
});
