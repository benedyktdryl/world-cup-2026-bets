import { betterAuth } from "better-auth";
import { createAppDatabase, runMigrations } from "./db";
import { ensureProfileForUser, parseAdminEmails } from "./invites";

const authDb = createAppDatabase();
runMigrations(authDb);

function splitEnvList(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const auth = betterAuth({
  appName: "World Cup Bets",
  baseURL: Bun.env.BETTER_AUTH_URL || "http://localhost:5173",
  secret:
    Bun.env.BETTER_AUTH_SECRET ||
    "development-secret-change-before-production-000000",
  database: authDb,
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: splitEnvList(Bun.env.TRUSTED_ORIGINS),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          ensureProfileForUser(authDb, {
            userId: user.id,
            email: user.email,
            name: user.name,
            adminEmails: parseAdminEmails(),
          });
        },
      },
      update: {
        after: async (user) => {
          ensureProfileForUser(authDb, {
            userId: user.id,
            email: user.email,
            name: user.name,
            adminEmails: parseAdminEmails(),
          });
        },
      },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
