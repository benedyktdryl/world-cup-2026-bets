import { randomBytes } from "node:crypto";
import { env } from "~/lib/server/env";
import { createAppDatabase, runMigrations } from "~/lib/server/db";
import {
  createInviteLink,
  consumeInviteLink,
  ensureProfileForUser,
  parseAdminEmails,
} from "~/lib/server/invites";
import { sqlGet, sqlRun } from "~/lib/server/sql";
import type { Route } from "./+types/api.setup.admin";

type UserRow = { id: string; email: string };

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function action({ request }: Route.ActionArgs) {
  const token = env("SETUP_BOOTSTRAP_TOKEN");
  const authHeader = request.headers.get("authorization");

  if (!token || authHeader !== `Bearer ${token}`) {
    return unauthorized();
  }

  const email = parseAdminEmails()[0];
  const allowedDomain = env("ALLOWED_EMAIL_DOMAINS").split(",")[0]?.trim();
  const password = randomBytes(12).toString("base64url");

  if (!email || !allowedDomain) {
    return Response.json(
      { error: "ADMIN_EMAILS and ALLOWED_EMAIL_DOMAINS must be set." },
      { status: 500 },
    );
  }

  const db = createAppDatabase();
  await runMigrations(db);

  const existing = await sqlGet<UserRow>(
    db,
    'SELECT id, email FROM "user" WHERE email = ?',
    [email],
  );

  const { auth } = await import("~/lib/server/auth");

  let userId: string;
  let created = false;

  if (existing) {
    userId = existing.id;
    await sqlRun(db, 'UPDATE "user" SET emailVerified = 1 WHERE id = ?', [
      userId,
    ]);
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

  const appUrl = env("BETTER_AUTH_URL");

  return Response.json({
    email,
    password: created ? password : null,
    created,
    role: profile.role,
    loginUrl: `${appUrl}/login`,
    message: created
      ? "Admin account created. Sign in with the password above."
      : "Admin account already existed; password unchanged.",
  });
}
