import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AppDatabase } from "./db";
import { env } from "./env";
import { sqlAll, sqlGet, sqlRun, sqlTransaction } from "./sql";

type InviteLinkRow = {
  id: string;
  token_hash: string;
  allowed_domain: string;
  max_uses: number;
  used_count: number;
  expires_at: number | null;
};

type ProfileRow = {
  user_id: string;
  email: string;
  display_name: string;
  role: "USER" | "ADMIN";
};

export type InviteValidationResult =
  | {
      ok: true;
      allowedDomain: string;
      remainingUses: number;
    }
  | {
      ok: false;
      reason:
        | "INVITE_NOT_FOUND"
        | "INVITE_EXPIRED"
        | "INVITE_EXHAUSTED"
        | "DOMAIN_NOT_ALLOWED";
    };

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string) {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  return atIndex >= 0 ? normalized.slice(atIndex + 1) : "";
}

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^@/, "");
}

function hashInviteToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

async function getInviteByRawToken(db: AppDatabase, rawToken: string) {
  return sqlGet<InviteLinkRow>(
    db,
    `SELECT id, token_hash, allowed_domain, max_uses, used_count, expires_at
     FROM invite_links
     WHERE token_hash = ?`,
    [hashInviteToken(rawToken)],
  );
}

export async function createInviteLink(
  db: AppDatabase,
  input: {
    allowedDomain: string;
    maxUses?: number;
    expiresAt?: Date;
    createdByUserId?: string;
  },
) {
  const rawToken = randomBytes(24).toString("base64url");
  const id = randomUUID();
  const allowedDomain = normalizeDomain(input.allowedDomain);

  await sqlRun(
    db,
    `INSERT INTO invite_links (
      id,
      token_hash,
      allowed_domain,
      max_uses,
      expires_at,
      created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      hashInviteToken(rawToken),
      allowedDomain,
      input.maxUses ?? 1,
      input.expiresAt?.getTime() ?? null,
      input.createdByUserId ?? null,
    ],
  );

  return {
    id,
    rawToken,
    allowedDomain,
  };
}

export async function validateInviteForEmail(
  db: AppDatabase,
  rawToken: string,
  email: string,
  options: { now?: Date } = {},
): Promise<InviteValidationResult> {
  const invite = await getInviteByRawToken(db, rawToken);
  if (!invite) {
    return { ok: false, reason: "INVITE_NOT_FOUND" };
  }

  const now = options.now ?? new Date();
  if (invite.expires_at != null && invite.expires_at <= now.getTime()) {
    return { ok: false, reason: "INVITE_EXPIRED" };
  }

  if (invite.used_count >= invite.max_uses) {
    return { ok: false, reason: "INVITE_EXHAUSTED" };
  }

  const signupDomain = emailDomain(email);
  const globalDomains = parseAllowedEmailDomains();

  if (!isEmailDomainAllowed(email, globalDomains)) {
    return { ok: false, reason: "DOMAIN_NOT_ALLOWED" };
  }

  if (signupDomain !== invite.allowed_domain) {
    return { ok: false, reason: "DOMAIN_NOT_ALLOWED" };
  }

  return {
    ok: true,
    allowedDomain: invite.allowed_domain,
    remainingUses: invite.max_uses - invite.used_count,
  };
}

export async function consumeInviteLink(
  db: AppDatabase,
  rawToken: string,
  input: {
    email: string;
    userId: string;
  },
) {
  const validation = await validateInviteForEmail(db, rawToken, input.email);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const invite = await getInviteByRawToken(db, rawToken);
  if (!invite) {
    throw new Error("INVITE_NOT_FOUND");
  }

  await sqlTransaction(db, async (tx) => {
    await sqlRun(
      tx,
      `UPDATE invite_links
       SET used_count = used_count + 1
       WHERE id = ?`,
      [invite.id],
    );

    await sqlRun(
      tx,
      `INSERT INTO invite_link_uses (id, invite_link_id, email, user_id)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), invite.id, normalizeEmail(input.email), input.userId],
    );
  });
}

export async function ensureProfileForUser(
  db: AppDatabase,
  input: {
    userId: string;
    email: string;
    name: string;
    adminEmails?: string[];
  },
) {
  const email = normalizeEmail(input.email);
  const adminEmails = new Set((input.adminEmails ?? []).map(normalizeEmail));
  const role = adminEmails.has(email) ? "ADMIN" : "USER";
  const displayName = input.name.trim() || email;

  await sqlRun(
    db,
    `INSERT INTO profiles (user_id, email, display_name, role, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email,
       display_name = excluded.display_name,
       role = CASE
         WHEN profiles.role = 'ADMIN' THEN 'ADMIN'
         ELSE excluded.role
       END,
       updated_at = excluded.updated_at`,
    [input.userId, email, displayName, role, Date.now()],
  );

  const profile = await sqlGet<ProfileRow>(
    db,
    `SELECT user_id, email, display_name, role
     FROM profiles
     WHERE user_id = ?`,
    [input.userId],
  );

  if (!profile) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  return {
    userId: profile.user_id,
    email: profile.email,
    displayName: profile.display_name,
    role: profile.role,
  };
}

export function parseAdminEmails(value = env("ADMIN_EMAILS")) {
  return value.split(",").map(normalizeEmail).filter(Boolean);
}

export function parseAllowedEmailDomains(
  value = env("ALLOWED_EMAIL_DOMAINS"),
) {
  return value
    .split(",")
    .map((domain) => normalizeDomain(domain))
    .filter(Boolean);
}

export function isEmailDomainAllowed(email: string, allowedDomains: string[]) {
  if (allowedDomains.length === 0) {
    return true;
  }

  return allowedDomains.includes(emailDomain(email));
}

type InviteListRow = {
  id: string;
  allowed_domain: string;
  max_uses: number;
  used_count: number;
  expires_at: number | null;
  created_at: number;
};

export async function listInviteLinks(db: AppDatabase) {
  const rows = await sqlAll<InviteListRow>(
    db,
    `SELECT id, allowed_domain, max_uses, used_count, expires_at, created_at
     FROM invite_links
     ORDER BY created_at DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    allowedDomain: row.allowed_domain,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

export function getDefaultInviteDomain() {
  const domains = parseAllowedEmailDomains();
  return domains[0] ?? "";
}
