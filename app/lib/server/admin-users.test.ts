import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  closeAppDatabase,
  createAppDatabase,
  runMigrations,
  type AppDatabase,
} from "./db";
import { sqlRun } from "./sql";
import { countOpenMatches, getRegisteredUserStats } from "./admin-users";

const tempDirs: string[] = [];

async function createTestDatabase(): Promise<AppDatabase> {
  const dir = mkdtempSync(join(tmpdir(), "world-cup-admin-users-"));
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

describe("admin user stats", () => {
  test("countOpenMatches excludes locked and unfetched knockout fixtures", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const open = countOpenMatches(
      [
        {
          kickoff_at: Date.parse("2026-06-15T18:00:00.000Z"),
          stage: "Group A",
          group_code: "A",
          status: "SCHEDULED",
          home_team: "Mexico",
          away_team: "South Africa",
        },
        {
          kickoff_at: Date.parse("2026-07-15T18:00:00.000Z"),
          stage: "Final",
          group_code: null,
          status: "SCHEDULED",
          home_team: "TBD",
          away_team: "TBD",
        },
        {
          kickoff_at: Date.parse("2026-06-20T18:00:00.000Z"),
          stage: "Group B",
          group_code: "B",
          status: "FINISHED",
          home_team: "Brazil",
          away_team: "France",
        },
      ],
      now,
    );

    expect(open).toBe(1);
  });

  test("getRegisteredUserStats aggregates bets and completion", async () => {
    const db = await createTestDatabase();
    const now = new Date("2026-06-01T12:00:00.000Z");

    await sqlRun(
      db,
      `INSERT INTO profiles (user_id, email, display_name, role, created_at, updated_at)
       VALUES ('user_a', 'a@example.com', 'Alice', 'USER', 1, 1),
              ('user_b', 'b@example.com', 'Bob', 'ADMIN', 2, 2)`,
    );
    await sqlRun(
      db,
      `INSERT INTO teams (id, name, updated_at)
       VALUES ('team_home', 'Home', 1), ('team_away', 'Away', 1)`,
    );
    await sqlRun(
      db,
      `INSERT INTO matches (
        id, stage, kickoff_at, home_team_id, away_team_id, status, updated_at
      ) VALUES
        ('match_1', 'Group A', ?, 'team_home', 'team_away', 'SCHEDULED', 1),
        ('match_2', 'Group B', ?, 'team_home', 'team_away', 'SCHEDULED', 1)`,
      [
        Date.parse("2026-06-15T18:00:00.000Z"),
        Date.parse("2026-06-16T18:00:00.000Z"),
      ],
    );
    await sqlRun(
      db,
      `INSERT INTO bets (
        id, user_id, match_id, predicted_home_goals, predicted_away_goals, updated_at
      ) VALUES
        ('bet_1', 'user_a', 'match_1', 1, 0, 1),
        ('bet_2', 'user_a', 'match_2', 2, 1, 1)`,
    );

    const { users, summary } = await getRegisteredUserStats(db, now);

    expect(summary).toMatchObject({
      totalUsers: 2,
      totalMatches: 2,
      openMatches: 2,
      averageBetsPlaced: 1,
      averageCompletionPercent: 50,
    });

    const alice = users.find((user) => user.userId === "user_a");
    const bob = users.find((user) => user.userId === "user_b");

    expect(alice).toMatchObject({
      betsPlaced: 2,
      completionPercent: 100,
      openCompletionPercent: 100,
      role: "USER",
    });
    expect(bob).toMatchObject({
      betsPlaced: 0,
      completionPercent: 0,
      openCompletionPercent: 0,
      role: "ADMIN",
    });

    closeAppDatabase(db);
  });
});
