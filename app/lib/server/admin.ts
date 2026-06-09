import { redirect } from "react-router";
import { createAppDatabase, runMigrations } from "./db";
import { requireSession } from "./session";

type ProfileRoleRow = {
  role: "USER" | "ADMIN";
};

export async function requireAdmin(request: Request) {
  const session = await requireSession(request);
  const db = createAppDatabase();
  runMigrations(db);

  try {
    const profile = db
      .query<ProfileRoleRow, [string]>(
        `SELECT role
         FROM profiles
         WHERE user_id = ?`,
      )
      .get(session.user.id);

    if (profile?.role !== "ADMIN") {
      throw redirect("/app");
    }

    return session;
  } finally {
    db.close();
  }
}
