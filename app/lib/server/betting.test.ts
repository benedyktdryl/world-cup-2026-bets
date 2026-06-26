import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BETTING_CLOSE_WINDOW_MS,
  isMatchLockedForBetting,
} from "~/lib/match-betting";
import {
  getLeaderboard,
  getScoringGoals,
  recalculateScores,
  scorePrediction,
  settleMatch,
  upsertBet,
} from "./betting";
import {
  closeAppDatabase,
  type AppDatabase,
  createAppDatabase,
  runMigrations,
} from "./db";
import { sqlRun } from "./sql";

const tempDirs: string[] = [];

async function seedContest(db: AppDatabase) {
  await sqlRun(
    db,
    `INSERT INTO profiles (user_id, email, display_name, role)
     VALUES (?, ?, ?, ?)`,
    ["user_ada", "ada@example.com", "Ada", "USER"],
  );
  await sqlRun(
    db,
    `INSERT INTO profiles (user_id, email, display_name, role)
     VALUES (?, ?, ?, ?)`,
    ["user_max", "max@example.com", "Max", "USER"],
  );
  await sqlRun(
    db,
    `INSERT INTO teams (id, source_id, name, group_code)
     VALUES (?, ?, ?, ?)`,
    ["team_poland", "fs_poland", "Poland", "A"],
  );
  await sqlRun(
    db,
    `INSERT INTO teams (id, source_id, name, group_code)
     VALUES (?, ?, ?, ?)`,
    ["team_germany", "fs_germany", "Germany", "A"],
  );
  await sqlRun(
    db,
    `INSERT INTO matches (
      id,
      source_id,
      stage,
      group_code,
      kickoff_at,
      home_team_id,
      away_team_id,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "match_1",
      "fs_match_1",
      "GROUP",
      "A",
      new Date("2026-06-01T20:00:00.000Z").getTime(),
      "team_poland",
      "team_germany",
      "SCHEDULED",
    ],
  );
}

async function createTestDatabase(): Promise<AppDatabase> {
  const dir = mkdtempSync(join(tmpdir(), "world-cup-betting-"));
  tempDirs.push(dir);
  const db = createAppDatabase(join(dir, "test.sqlite"));
  await runMigrations(db);
  await seedContest(db);
  return db;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("simple scoring", () => {
  test("awards 3 for exact score, 1 for result, and 0 otherwise", () => {
    expect(
      scorePrediction({
        predictedHomeGoals: 2,
        predictedAwayGoals: 1,
        actualHomeGoals: 2,
        actualAwayGoals: 1,
      }),
    ).toEqual({ points: 3, reason: "EXACT" });

    expect(
      scorePrediction({
        predictedHomeGoals: 1,
        predictedAwayGoals: 0,
        actualHomeGoals: 2,
        actualAwayGoals: 1,
      }),
    ).toEqual({ points: 1, reason: "RESULT" });

    expect(
      scorePrediction({
        predictedHomeGoals: 0,
        predictedAwayGoals: 1,
        actualHomeGoals: 2,
        actualAwayGoals: 1,
      }),
    ).toEqual({ points: 0, reason: "MISS" });
  });

  test("keeps scheduled tournament fixtures open more than 2 hours before kickoff", () => {
    expect(
      isMatchLockedForBetting({
        kickoff_at: Date.now() + BETTING_CLOSE_WINDOW_MS + 60_000,
        stage: "Round 1",
        group_code: "Round 1",
        status: "SCHEDULED",
        home_team: "Mexico",
        away_team: "South Africa",
      }),
    ).toBe(false);
  });

  test("locks knockout fixtures that have not been fetched yet", () => {
    expect(
      isMatchLockedForBetting({
        kickoff_at: Date.now() + BETTING_CLOSE_WINDOW_MS + 60_000,
        stage: "1/8",
        group_code: null,
        status: "SCHEDULED",
        home_team: "France",
        away_team: null,
      }),
    ).toBe(true);
  });

  test("prevents editing a bet within 2 hours of kickoff", async () => {
    const db = await createTestDatabase();

    await upsertBet(db, {
      userId: "user_ada",
      matchId: "match_1",
      predictedHomeGoals: 2,
      predictedAwayGoals: 1,
      now: new Date("2026-06-01T17:59:00.000Z"),
    });

    await expect(
      upsertBet(db, {
        userId: "user_ada",
        matchId: "match_1",
        predictedHomeGoals: 3,
        predictedAwayGoals: 1,
        now: new Date("2026-06-01T18:00:00.000Z"),
      }),
    ).rejects.toThrow("MATCH_LOCKED");

    closeAppDatabase(db);
  });

  test("recalculates scores and orders leaderboard by points", async () => {
    const db = await createTestDatabase();

    await upsertBet(db, {
      userId: "user_ada",
      matchId: "match_1",
      predictedHomeGoals: 2,
      predictedAwayGoals: 1,
      now: new Date("2026-06-01T07:00:00.000Z"),
    });
    await upsertBet(db, {
      userId: "user_max",
      matchId: "match_1",
      predictedHomeGoals: 1,
      predictedAwayGoals: 0,
      now: new Date("2026-06-01T07:00:00.000Z"),
    });

    await settleMatch(db, {
      matchId: "match_1",
      homeGoals: 2,
      awayGoals: 1,
    });
    await recalculateScores(db, "match_1");

    expect(await getLeaderboard(db)).toEqual([
      {
        userId: "user_ada",
        displayName: "Ada",
        points: 3,
        exactScores: 1,
        resultHits: 0,
        totalBets: 1,
      },
      {
        userId: "user_max",
        displayName: "Max",
        points: 1,
        exactScores: 0,
        resultHits: 1,
        totalBets: 1,
      },
    ]);

    closeAppDatabase(db);
  });

  test("grades extra-time matches against 90-minute scores", async () => {
    const db = await createTestDatabase();

    await upsertBet(db, {
      userId: "user_ada",
      matchId: "match_1",
      predictedHomeGoals: 1,
      predictedAwayGoals: 1,
      now: new Date("2026-06-01T07:00:00.000Z"),
    });

    await settleMatch(db, {
      matchId: "match_1",
      homeGoals: 2,
      awayGoals: 1,
      homeGoals90: 1,
      awayGoals90: 1,
      wentToExtraTime: true,
    });
    await recalculateScores(db, "match_1");

    expect(await getLeaderboard(db)).toEqual([
      {
        userId: "user_ada",
        displayName: "Ada",
        points: 3,
        exactScores: 1,
        resultHits: 0,
        totalBets: 1,
      },
      {
        userId: "user_max",
        displayName: "Max",
        points: 0,
        exactScores: 0,
        resultHits: 0,
        totalBets: 0,
      },
    ]);
  });

  test("prefers 90-minute goals for scoring when both score pairs exist", () => {
    expect(
      getScoringGoals({
        home_goals_90: 1,
        away_goals_90: 1,
        home_goals: 2,
        away_goals: 1,
      }),
    ).toEqual({
      homeGoals: 1,
      awayGoals: 1,
    });
  });
});
