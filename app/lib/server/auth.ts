import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { authSchema } from "./auth-schema";
import { createAppDatabase, ensureMigrations, getDrizzleDb } from "./db";
import { env } from "./env";
import { ensureProfileForUser, parseAdminEmails } from "./invites";

const authDb = createAppDatabase();
const drizzleDb = getDrizzleDb(authDb);
const migrationsReady = ensureMigrations(authDb);

function splitEnvList(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const auth = betterAuth({
  appName: "World Cup Bets",
  baseURL: env("BETTER_AUTH_URL", "http://localhost:5173"),
  secret:
    env("BETTER_AUTH_SECRET") ||
    "development-secret-change-before-production-000000",
  database: drizzleAdapter(drizzleDb, {
    provider: "sqlite",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: splitEnvList(env("TRUSTED_ORIGINS")),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await migrationsReady;
          await ensureProfileForUser(authDb, {
            userId: user.id,
            email: user.email,
            name: user.name,
            adminEmails: parseAdminEmails(),
          });
        },
      },
      update: {
        after: async (user) => {
          await migrationsReady;
          await ensureProfileForUser(authDb, {
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
