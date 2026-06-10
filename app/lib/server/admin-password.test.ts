import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAppDatabase,
  runMigrations,
  type AppDatabase,
} from "./db";
import {
  generateTemporaryPassword,
  resetUserPassword,
  validateNewPassword,
} from "./admin-password";
import { sqlGet } from "./sql";

const tempDirs: string[] = [];

async function createTestDatabase(): Promise<AppDatabase> {
  const dir = mkdtempSync(join(tmpdir(), "world-cup-admin-password-"));
  tempDirs.push(dir);
  Bun.env.DB_PATH = join(dir, "test.sqlite");
  Bun.env.BETTER_AUTH_URL = "http://localhost:5173";
  Bun.env.BETTER_AUTH_SECRET =
    "test-secret-for-better-auth-integration-000000";

  const db = createAppDatabase();
  await runMigrations(db);
  return db;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("admin password reset", () => {
  test("validateNewPassword enforces minimum length", () => {
    expect(validateNewPassword("short")).toBe(
      "Password must be at least 8 characters.",
    );
    expect(validateNewPassword("longenough")).toBeNull();
  });

  test("resetUserPassword updates credential hash and clears sessions", async () => {
    const db = await createTestDatabase();
    const { auth } = await import("./auth");

    const signup = await auth.api.signUpEmail({
      body: {
        email: "player@example.com",
        password: "oldpassword1",
        name: "Player",
      },
    });

    await auth.api.signInEmail({
      body: {
        email: "player@example.com",
        password: "oldpassword1",
      },
    });

    const newPassword = generateTemporaryPassword();
    await resetUserPassword(db, {
      userId: signup.user.id,
      newPassword,
    });

    const sessions =
      (
        await sqlGet<{ total: number }>(
          db,
          "SELECT COUNT(*) AS total FROM session WHERE userId = ?",
          [signup.user.id],
        )
      )?.total ?? 0;

    expect(sessions).toBe(0);

    const signIn = await auth.api.signInEmail({
      body: {
        email: "player@example.com",
        password: newPassword,
      },
    });

    expect(signIn.user.id).toBe(signup.user.id);
  });
});
