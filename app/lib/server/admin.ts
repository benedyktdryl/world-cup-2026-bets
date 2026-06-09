import { redirect } from "react-router";
import { createAppDatabase, ensureMigrations } from "./db";
import { sqlGet } from "./sql";
import { requireSession } from "./session";

type ProfileRoleRow = {
  role: "USER" | "ADMIN";
};

export async function requireAdmin(request: Request) {
  const session = await requireSession(request);
  const db = createAppDatabase();
  await ensureMigrations(db);

  const profile = await sqlGet<ProfileRoleRow>(
    db,
    `SELECT role
     FROM profiles
     WHERE user_id = ?`,
    [session.user.id],
  );

  if (profile?.role !== "ADMIN") {
    throw redirect("/app");
  }

  return session;
}
