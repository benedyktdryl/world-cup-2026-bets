import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("better-auth sqlite integration", () => {
  test("signs up a user against the app SQLite schema", async () => {
    const dir = mkdtempSync(join(tmpdir(), "world-cup-auth-"));
    Bun.env.DB_PATH = join(dir, "auth.sqlite");
    Bun.env.BETTER_AUTH_URL = "http://localhost:5173";
    Bun.env.BETTER_AUTH_SECRET =
      "test-secret-for-better-auth-integration-000000";
    Bun.env.ADMIN_EMAILS = "admin@example.com";

    const { auth } = await import("./auth");

    const result = await auth.api.signUpEmail({
      body: {
        email: "admin@example.com",
        password: "password123",
        name: "Admin User",
      },
    });

    expect(result.user.email).toBe("admin@example.com");
    expect(result.user.name).toBe("Admin User");
  });
});
