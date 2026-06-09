import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isMatchLockedForBetting } from "~/lib/match-betting";
import {
  getLeaderboard,
  recalculateScores,
  scorePrediction,
  settleMatch,
  upsertBet,
} from "./betting";
import { type AppDatabase, createAppDatabase, runMigrations } from "./db";

const tempDirs: string[] = [];

function createTestDatabase(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), "world-cup-betting-"));
  tempDirs.push(dir);
  const db = createAppDatabase(join(dir, "test.sqlite"));
  runMigrations(db);
  seedContest(db);
  return db;
}

function seedContest(db: AppDatabase) {
  db.query(
    `INSERT INTO profiles (user_id, email, display_name, role)
     VALUES (?, ?, ?, ?)`,
  ).run("user_ada", "ada@example.com", "Ada", "USER");
  db.query(
    `INSERT INTO profiles (user_id, email, display_name, role)
     VALUES (?, ?, ?, ?)`,
  ).run("user_max", "max@example.com", "Max", "USER");
  db.query(
    `INSERT INTO teams (id, source_id, name, group_code)
     VALUES (?, ?, ?, ?)`,
  ).run("team_poland", "fs_poland", "Poland", "A");
  db.query(
    `INSERT INTO teams (id, source_id, name, group_code)
     VALUES (?, ?, ?, ?)`,
  ).run("team_germany", "fs_germany", "Germany", "A");
  db.query(
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
  ).run(
    "match_1",
    "fs_match_1",
    "GROUP",
    "A",
    new Date("2026-06-01T20:00:00.000Z").getTime(),
    "team_poland",
    "team_germany",
    "SCHEDULED",
  );
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

  test("keeps scheduled tournament fixtures open before kickoff", () => {
    expect(
      isMatchLockedForBetting({
        kickoff_at: Date.now() + 60_000,
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
        kickoff_at: Date.now() + 60_000,
        stage: "1/8",
        group_code: null,
        status: "SCHEDULED",
        home_team: "France",
        away_team: null,
      }),
    ).toBe(true);
  });

  test("prevents editing a bet once kickoff has passed", () => {
    const db = createTestDatabase();

    upsertBet(db, {
      userId: "user_ada",
      matchId: "match_1",
      predictedHomeGoals: 2,
      predictedAwayGoals: 1,
      now: new Date("2026-06-01T19:59:00.000Z"),
    });

    expect(() =>
      upsertBet(db, {
        userId: "user_ada",
        matchId: "match_1",
        predictedHomeGoals: 3,
        predictedAwayGoals: 1,
        now: new Date("2026-06-01T20:00:00.000Z"),
      }),
    ).toThrow("MATCH_LOCKED");

    db.close();
  });

  test("recalculates scores and orders leaderboard by points", () => {
    const db = createTestDatabase();

    upsertBet(db, {
      userId: "user_ada",
      matchId: "match_1",
      predictedHomeGoals: 2,
      predictedAwayGoals: 1,
      now: new Date("2026-06-01T19:00:00.000Z"),
    });
    upsertBet(db, {
      userId: "user_max",
      matchId: "match_1",
      predictedHomeGoals: 1,
      predictedAwayGoals: 0,
      now: new Date("2026-06-01T19:00:00.000Z"),
    });

    settleMatch(db, {
      matchId: "match_1",
      homeGoals: 2,
      awayGoals: 1,
    });
    recalculateScores(db, "match_1");

    expect(getLeaderboard(db)).toEqual([
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

    db.close();
  });
});
