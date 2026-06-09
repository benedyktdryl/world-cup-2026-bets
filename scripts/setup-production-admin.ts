import { createAppDatabase, runMigrations } from "../app/lib/server/db";
import { parseAdminEmails } from "../app/lib/server/invites";
import { sqlGet, sqlRun } from "../app/lib/server/sql";

const email = parseAdminEmails()[0];
const password = process.env.SETUP_PASSWORD?.trim();
const allowedDomain = process.env.ALLOWED_EMAIL_DOMAINS?.split(",")[0]?.trim();

if (!email) {
  console.error("ADMIN_EMAILS must include at least one email.");
  process.exit(1);
}

if (!password || password.length < 8) {
  console.error("SETUP_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

if (!allowedDomain) {
  console.error("ALLOWED_EMAIL_DOMAINS must be set.");
  process.exit(1);
}

type UserRow = { id: string; email: string };

const db = createAppDatabase();
await runMigrations(db);

const existing = await sqlGet<UserRow>(
  db,
  'SELECT id, email FROM "user" WHERE email = ?',
  [email],
);

const { createInviteLink, consumeInviteLink, ensureProfileForUser } =
  await import("../app/lib/server/invites");
const { auth } = await import("../app/lib/server/auth");

let userId: string;
let created = false;

if (existing) {
  userId = existing.id;
  await sqlRun(db, 'UPDATE "user" SET emailVerified = 1 WHERE id = ?', [userId]);
} else {
  const invite = await createInviteLink(db, {
    allowedDomain,
    maxUses: 1,
  });

  const signup = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name: email.split("@")[0] ?? "Admin",
    },
  });

  await consumeInviteLink(db, invite.rawToken, {
    email,
    userId: signup.user.id,
  });

  await sqlRun(db, 'UPDATE "user" SET emailVerified = 1 WHERE id = ?', [
    signup.user.id,
  ]);

  userId = signup.user.id;
  created = true;
}

const profile = await ensureProfileForUser(db, {
  userId,
  email,
  name: email.split("@")[0] ?? "Admin",
  adminEmails: parseAdminEmails(),
});

const appUrl = process.env.BETTER_AUTH_URL ?? "https://world-cup-2026-bets-eta.vercel.app";

console.log(
  JSON.stringify(
    {
      email,
      password,
      created,
      role: profile.role,
      loginUrl: `${appUrl}/login`,
    },
    null,
    2,
  ),
);
