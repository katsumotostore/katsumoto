import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PDF preview security policy", () => {
  it.each(["public/_headers", "vercel.json", "nginx.conf"])("permits local blob frames without relaxing scripts in %s", (path) => {
    const config = readFileSync(path, "utf8");
    expect(config).toContain("frame-src 'self' blob:;");
    expect(config).toContain("frame-ancestors 'self';");
    expect(config).toContain("default-src 'self';");
    const scriptPolicy = config.match(/script-src ([^;]+);/)?.[1];
    expect(scriptPolicy).toBeDefined();
    expect(scriptPolicy).not.toMatch(/blob:|\*|'unsafe-eval'/);
  });
});
