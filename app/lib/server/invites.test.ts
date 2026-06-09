import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  closeAppDatabase,
  type AppDatabase,
  createAppDatabase,
  runMigrations,
} from "./db";
import {
  consumeInviteLink,
  createInviteLink,
  ensureProfileForUser,
  isEmailDomainAllowed,
  parseAllowedEmailDomains,
  validateInviteForEmail,
} from "./invites";

const tempDirs: string[] = [];
let previousAllowedDomains: string | undefined;

beforeEach(() => {
  previousAllowedDomains = Bun.env.ALLOWED_EMAIL_DOMAINS;
  delete Bun.env.ALLOWED_EMAIL_DOMAINS;
});

async function createTestDatabase(): Promise<AppDatabase> {
  const dir = mkdtempSync(join(tmpdir(), "world-cup-bets-"));
  tempDirs.push(dir);
  const db = createAppDatabase(join(dir, "test.sqlite"));
  await runMigrations(db);
  return db;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }

  if (previousAllowedDomains === undefined) {
    delete Bun.env.ALLOWED_EMAIL_DOMAINS;
  } else {
    Bun.env.ALLOWED_EMAIL_DOMAINS = previousAllowedDomains;
  }
});

describe("invite links", () => {
  test("accepts an unused invite for the configured email domain", async () => {
    const db = await createTestDatabase();
    const invite = await createInviteLink(db, {
      allowedDomain: "example.com",
      maxUses: 2,
      expiresAt: new Date("2026-06-01T10:00:00.000Z"),
    });

    const result = await validateInviteForEmail(
      db,
      invite.rawToken,
      "Ada@Example.com",
      {
        now: new Date("2026-06-01T09:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      ok: true,
      allowedDomain: "example.com",
      remainingUses: 2,
    });

    closeAppDatabase(db);
  });

  test("rejects invites for a different domain", async () => {
    const db = await createTestDatabase();
    const invite = await createInviteLink(db, {
      allowedDomain: "example.com",
      maxUses: 1,
    });

    const result = await validateInviteForEmail(
      db,
      invite.rawToken,
      "ada@other.com",
    );

    expect(result).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });

    closeAppDatabase(db);
  });

  test("consumeInviteLink records use and prevents overuse", async () => {
    const db = await createTestDatabase();
    const invite = await createInviteLink(db, {
      allowedDomain: "example.com",
      maxUses: 1,
    });

    await consumeInviteLink(db, invite.rawToken, {
      email: "ada@example.com",
      userId: "user_1",
    });

    expect(
      await validateInviteForEmail(db, invite.rawToken, "ada@example.com"),
    ).toEqual({
      ok: false,
      reason: "INVITE_EXHAUSTED",
    });

    closeAppDatabase(db);
  });

  test("rejects signups outside ALLOWED_EMAIL_DOMAINS when configured", async () => {
    const previous = Bun.env.ALLOWED_EMAIL_DOMAINS;
    Bun.env.ALLOWED_EMAIL_DOMAINS = "company.com";

    try {
      const db = await createTestDatabase();
      const invite = await createInviteLink(db, {
        allowedDomain: "company.com",
        maxUses: 5,
      });

      expect(
        await validateInviteForEmail(db, invite.rawToken, "ada@company.com"),
      ).toEqual({
        ok: true,
        allowedDomain: "company.com",
        remainingUses: 5,
      });

      expect(
        await validateInviteForEmail(db, invite.rawToken, "ada@gmail.com"),
      ).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });

      closeAppDatabase(db);
    } finally {
      if (previous === undefined) {
        delete Bun.env.ALLOWED_EMAIL_DOMAINS;
      } else {
        Bun.env.ALLOWED_EMAIL_DOMAINS = previous;
      }
    }
  });

  test("parseAllowedEmailDomains and isEmailDomainAllowed normalize values", () => {
    expect(parseAllowedEmailDomains(" Acme.COM , @other.io ")).toEqual([
      "acme.com",
      "other.io",
    ]);
    expect(isEmailDomainAllowed("ada@acme.com", ["acme.com"])).toBe(true);
    expect(isEmailDomainAllowed("ada@other.io", ["acme.com"])).toBe(false);
    expect(isEmailDomainAllowed("ada@any.com", [])).toBe(true);
  });

  test("ensureProfileForUser assigns admin role from configured emails", async () => {
    const db = await createTestDatabase();

    const profile = await ensureProfileForUser(db, {
      userId: "user_admin",
      email: "boss@example.com",
      name: "Boss",
      adminEmails: ["boss@example.com"],
    });

    expect(profile).toEqual({
      userId: "user_admin",
      email: "boss@example.com",
      displayName: "Boss",
      role: "ADMIN",
    });

    closeAppDatabase(db);
  });
});
