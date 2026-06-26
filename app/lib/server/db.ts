import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "./env";
import { sqlAll, sqlExec, sqlRun } from "./sql";

export type AppDatabase = Client;

let sharedDatabase: Client | undefined;
let migrationsPromise: Promise<void> | undefined;

function toLibsqlUrl(path: string) {
  if (path === ":memory:") {
    return ":memory:";
  }

  return path.startsWith("file:") ? path : `file:${path}`;
}

export function getDatabasePath() {
  return env("DB_PATH", "./data/world-cup-bets.sqlite");
}

export function getDatabaseUrl(path = getDatabasePath()) {
  const tursoUrl = env("TURSO_DATABASE_URL");
  if (tursoUrl) {
    return tursoUrl;
  }

  return toLibsqlUrl(path);
}

export function createAppDatabase(path?: string): AppDatabase {
  if (path) {
    return createClient({
      url: getDatabaseUrl(path),
    });
  }

  if (!sharedDatabase) {
    const url = getDatabaseUrl();
    if (!url.startsWith("libsql:") && url !== ":memory:") {
      mkdirSync(dirname(getDatabasePath()), { recursive: true });
    }

    sharedDatabase = createClient({
      url,
      authToken: env("TURSO_AUTH_TOKEN") || undefined,
    });
  }

  return sharedDatabase;
}

export function getDrizzleDb(db: AppDatabase = createAppDatabase()) {
  return drizzle(db);
}

export function closeAppDatabase(db: AppDatabase) {
  if (db !== sharedDatabase) {
    db.close();
  }
}

export async function runMigrations(db: AppDatabase) {
  await sqlExec(
    db,
    `
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expiresAt INTEGER NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      accountId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      accessToken TEXT,
      refreshToken TEXT,
      accessTokenExpiresAt INTEGER,
      refreshTokenExpiresAt INTEGER,
      scope TEXT,
      idToken TEXT,
      password TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT 'slate',
      role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS invite_links (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      allowed_domain TEXT NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER,
      created_by_user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      CHECK (max_uses > 0),
      CHECK (used_count >= 0),
      CHECK (used_count <= max_uses)
    );

    CREATE TABLE IF NOT EXISTS invite_link_uses (
      id TEXT PRIMARY KEY,
      invite_link_id TEXT NOT NULL REFERENCES invite_links(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      user_id TEXT NOT NULL,
      used_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS invite_link_uses_invite_idx
      ON invite_link_uses(invite_link_id);

    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      source_id TEXT UNIQUE,
      name TEXT NOT NULL,
      group_code TEXT,
      country_code TEXT,
      flag_emoji TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      source_id TEXT UNIQUE,
      competition_id TEXT,
      stage TEXT NOT NULL,
      group_code TEXT,
      kickoff_at INTEGER NOT NULL,
      home_team_id TEXT REFERENCES teams(id),
      away_team_id TEXT REFERENCES teams(id),
      home_goals INTEGER,
      away_goals INTEGER,
      home_goals_90 INTEGER,
      away_goals_90 INTEGER,
      went_to_extra_time INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED', 'LIVE', 'FINISHED')),
      source_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS matches_kickoff_idx
      ON matches(kickoff_at);

    CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      predicted_home_goals INTEGER NOT NULL,
      predicted_away_goals INTEGER NOT NULL,
      locked_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      UNIQUE(user_id, match_id),
      CHECK (predicted_home_goals >= 0),
      CHECK (predicted_away_goals >= 0)
    );

    CREATE TABLE IF NOT EXISTS scores (
      user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      points INTEGER NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('EXACT', 'RESULT', 'MISS')),
      calculated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY(user_id, match_id)
    );

    CREATE TABLE IF NOT EXISTS competitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      season TEXT,
      source_url TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS scraped_pages (
      url TEXT PRIMARY KEY,
      fetched_at INTEGER NOT NULL,
      html TEXT NOT NULL,
      etag TEXT,
      last_modified TEXT
    );

    CREATE TABLE IF NOT EXISTS crawl_jobs (
      id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
      teams_count INTEGER NOT NULL DEFAULT 0,
      matches_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER
    );
  `,
  );

  await ensureMatchesScoreColumns(db);
}

type TableColumnRow = {
  name: string;
};

async function ensureMatchesScoreColumns(db: AppDatabase) {
  const columns = await sqlAll<TableColumnRow>(db, "PRAGMA table_info(matches)");
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("home_goals_90")) {
    await sqlExec(db, "ALTER TABLE matches ADD COLUMN home_goals_90 INTEGER");
  }
  if (!names.has("away_goals_90")) {
    await sqlExec(db, "ALTER TABLE matches ADD COLUMN away_goals_90 INTEGER");
  }
  if (!names.has("went_to_extra_time")) {
    await sqlExec(
      db,
      "ALTER TABLE matches ADD COLUMN went_to_extra_time INTEGER NOT NULL DEFAULT 0",
    );
  }

  await sqlRun(
    db,
    `UPDATE matches
     SET home_goals_90 = home_goals,
       away_goals_90 = away_goals
     WHERE status = 'FINISHED'
       AND home_goals IS NOT NULL
       AND away_goals IS NOT NULL
       AND home_goals_90 IS NULL
       AND away_goals_90 IS NULL`,
  );
}

export async function ensureMigrations(db: AppDatabase = createAppDatabase()) {
  if (!migrationsPromise) {
    migrationsPromise = runMigrations(db);
  }

  await migrationsPromise;
}

export async function withDatabase<T>(
  fn: (db: AppDatabase) => Promise<T>,
  path?: string,
): Promise<T> {
  const db = createAppDatabase(path);
  await ensureMigrations(db);
  return fn(db);
}
