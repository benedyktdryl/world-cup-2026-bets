import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppDatabase, createAppDatabase, runMigrations } from "./db";
import {
  consumeInviteLink,
  createInviteLink,
  ensureProfileForUser,
  validateInviteForEmail,
} from "./invites";

const tempDirs: string[] = [];

function createTestDatabase(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), "world-cup-bets-"));
  tempDirs.push(dir);
  const db = createAppDatabase(join(dir, "test.sqlite"));
  runMigrations(db);
  return db;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("invite links", () => {
  test("accepts an unused invite for the configured email domain", () => {
    const db = createTestDatabase();
    const invite = createInviteLink(db, {
      allowedDomain: "example.com",
      maxUses: 2,
      expiresAt: new Date("2026-06-01T10:00:00.000Z"),
    });

    const result = validateInviteForEmail(
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

    db.close();
  });

  test("rejects invites for a different domain", () => {
    const db = createTestDatabase();
    const invite = createInviteLink(db, {
      allowedDomain: "example.com",
      maxUses: 1,
    });

    const result = validateInviteForEmail(db, invite.rawToken, "ada@other.com");

    expect(result).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });

    db.close();
  });

  test("consumeInviteLink records use and prevents overuse", () => {
    const db = createTestDatabase();
    const invite = createInviteLink(db, {
      allowedDomain: "example.com",
      maxUses: 1,
    });

    consumeInviteLink(db, invite.rawToken, {
      email: "ada@example.com",
      userId: "user_1",
    });

    expect(
      validateInviteForEmail(db, invite.rawToken, "ada@example.com"),
    ).toEqual({
      ok: false,
      reason: "INVITE_EXHAUSTED",
    });

    db.close();
  });

  test("ensureProfileForUser assigns admin role from configured emails", () => {
    const db = createTestDatabase();

    const profile = ensureProfileForUser(db, {
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

    db.close();
  });
});
