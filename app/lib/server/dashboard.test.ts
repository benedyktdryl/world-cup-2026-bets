import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDashboardData } from "./dashboard";
import {
  type AppDatabase,
  closeAppDatabase,
  createAppDatabase,
  runMigrations,
} from "./db";
import { sqlRun } from "./sql";

const tempDirs: string[] = [];

async function setupDb(): Promise<AppDatabase> {
  const dir = mkdtempSync(join(tmpdir(), "dashboard-test-"));
  tempDirs.push(dir);
  const db = createAppDatabase(join(dir, "test.sqlite"));
  await runMigrations(db);
  return db;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("getDashboardData spotlight", () => {
  test("skips past scheduled matches and picks the next upcoming fixture", async () => {
    const db = await setupDb();
    const now = Date.UTC(2026, 5, 17, 12, 0, 0);

    await sqlRun(
      db,
      `INSERT INTO teams (id, name) VALUES ('home-a', 'Austria'), ('away-a', 'Jordan')`,
    );
    await sqlRun(
      db,
      `INSERT INTO teams (id, name) VALUES ('home-b', 'Mexico'), ('away-b', 'South Africa')`,
    );
    await sqlRun(
      db,
      `INSERT INTO matches (
        id, kickoff_at, stage, group_code, status, home_team_id, away_team_id
      ) VALUES
        ('past', ?, 'Group A', 'A', 'SCHEDULED', 'home-a', 'away-a'),
        ('next', ?, 'Group A', 'A', 'SCHEDULED', 'home-b', 'away-b')`,
      [now - 60_000, now + 86_400_000],
    );

    const data = await getDashboardData(db, "user-1", now);

    expect(data.spotlight).toEqual({
      kind: "upcoming",
      match: expect.objectContaining({
        id: "next",
        home_team: "Mexico",
        away_team: "South Africa",
      }),
    });

    closeAppDatabase(db);
  });

  test("prefers live matches over upcoming fixtures", async () => {
    const db = await setupDb();
    const now = Date.UTC(2026, 5, 17, 12, 0, 0);

    await sqlRun(
      db,
      `INSERT INTO teams (id, name) VALUES ('home-a', 'Austria'), ('away-a', 'Jordan')`,
    );
    await sqlRun(
      db,
      `INSERT INTO teams (id, name) VALUES ('home-b', 'Mexico'), ('away-b', 'South Africa')`,
    );
    await sqlRun(
      db,
      `INSERT INTO matches (
        id, kickoff_at, stage, group_code, status, home_team_id, away_team_id
      ) VALUES
        ('live', ?, 'Group A', 'A', 'LIVE', 'home-a', 'away-a'),
        ('next', ?, 'Group A', 'A', 'SCHEDULED', 'home-b', 'away-b')`,
      [now - 3_600_000, now + 86_400_000],
    );

    const data = await getDashboardData(db, "user-1", now);

    expect(data.spotlight).toEqual({
      kind: "live",
      match: expect.objectContaining({
        id: "live",
        home_team: "Austria",
        away_team: "Jordan",
      }),
    });

    closeAppDatabase(db);
  });
});
