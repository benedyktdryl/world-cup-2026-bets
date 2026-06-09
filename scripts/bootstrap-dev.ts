import { auth } from "../app/lib/server/auth";
import { crawlFlashscoreCompetition } from "../app/lib/server/crawl/flashscore";
import {
  closeAppDatabase,
  createAppDatabase,
  runMigrations,
} from "../app/lib/server/db";
import { env } from "../app/lib/server/env";
import {
  consumeInviteLink,
  createInviteLink,
  ensureProfileForUser,
  parseAdminEmails,
} from "../app/lib/server/invites";
import { sqlGet, sqlRun } from "../app/lib/server/sql";

const DEV_EMAIL = "cypherq@gmail.com";
const DEV_PASSWORD = "devtest123";
const DEV_NAME = "Cypher Q";
const FLASHSCORE_WC_URL =
  "https://www.flashscore.com/football/world/world-championship/";

type UserRow = { id: string; email: string };

async function ensureDevUser(db: ReturnType<typeof createAppDatabase>) {
  const existing = await sqlGet<UserRow>(
    db,
    "SELECT id, email FROM user WHERE email = ?",
    [DEV_EMAIL],
  );

  if (existing) {
    await sqlRun(db, "UPDATE user SET emailVerified = 1 WHERE id = ?", [
      existing.id,
    ]);
    await ensureProfileForUser(db, {
      userId: existing.id,
      email: DEV_EMAIL,
      name: DEV_NAME,
      adminEmails: parseAdminEmails(),
    });
    return { userId: existing.id, created: false };
  }

  const invite = await createInviteLink(db, {
    allowedDomain: "gmail.com",
    maxUses: 25,
  });

  const signup = await auth.api.signUpEmail({
    body: {
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      name: DEV_NAME,
    },
  });

  await consumeInviteLink(db, invite.rawToken, {
    email: DEV_EMAIL,
    userId: signup.user.id,
  });

  await sqlRun(db, "UPDATE user SET emailVerified = 1 WHERE id = ?", [
    signup.user.id,
  ]);

  return { userId: signup.user.id, created: true };
}

async function main() {
  const db = createAppDatabase();
  await runMigrations(db);

  const user = await ensureDevUser(db);

  const crawl = await crawlFlashscoreCompetition(db, {
    competitionName: "World Cup 2026",
    sourceUrl: FLASHSCORE_WC_URL,
    baseUrl: "https://www.flashscore.com",
    minDelayMs: 0,
    retries: 3,
  });

  const signIn = await auth.api.signInEmail({
    body: {
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
      rememberMe: true,
    },
    asResponse: true,
  });

  const setCookie = signIn.headers.getSetCookie?.() ?? [];
  const cookieHeader = setCookie
    .map((entry) => entry.split(";")[0])
    .filter(Boolean)
    .join("; ");

  const matchCount =
    (await sqlGet<{ count: number }>(
      db,
      "SELECT COUNT(*) AS count FROM matches",
    ))?.count ?? 0;
  const teamCount =
    (await sqlGet<{ count: number }>(db, "SELECT COUNT(*) AS count FROM teams"))
      ?.count ?? 0;

  closeAppDatabase(db);

  console.log(
    JSON.stringify(
      {
        user: {
          email: DEV_EMAIL,
          password: DEV_PASSWORD,
          created: user.created,
          verified: true,
          admin: true,
        },
        crawl,
        database: {
          teams: teamCount,
          matches: matchCount,
        },
        appUrl: env("BETTER_AUTH_URL", "http://localhost:5173"),
        sessionCookie: cookieHeader || null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error("Bootstrap failed:", error);
  }
  process.exit(1);
});
