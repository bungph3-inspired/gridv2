import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Tests share a process so the dbContext Proxy + ALS work coherently.
    // Acceptable for a small suite — revisit pool sizing if total runtime gets
    // painful.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 10000,
  },
});
