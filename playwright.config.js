const { defineConfig } = require("@playwright/test");

const isCI = Boolean(process.env.CI);

module.exports = defineConfig({
  testDir: "./test/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  outputDir: "test-results/playwright-artifacts",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    browserName: "chromium",
    ...(isCI ? {} : { channel: "msedge" }),
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
