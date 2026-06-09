import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AppDatabase } from "./db";

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

function getInviteByRawToken(db: AppDatabase, rawToken: string) {
  return db
    .query<InviteLinkRow, [string]>(
      `SELECT id, token_hash, allowed_domain, max_uses, used_count, expires_at
       FROM invite_links
       WHERE token_hash = ?`,
    )
    .get(hashInviteToken(rawToken));
}

export function createInviteLink(
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

  db.query(
    `INSERT INTO invite_links (
      id,
      token_hash,
      allowed_domain,
      max_uses,
      expires_at,
      created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    hashInviteToken(rawToken),
    allowedDomain,
    input.maxUses ?? 1,
    input.expiresAt?.getTime() ?? null,
    input.createdByUserId ?? null,
  );

  return {
    id,
    rawToken,
    allowedDomain,
  };
}

export function validateInviteForEmail(
  db: AppDatabase,
  rawToken: string,
  email: string,
  options: { now?: Date } = {},
): InviteValidationResult {
  const invite = getInviteByRawToken(db, rawToken);
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

  if (emailDomain(email) !== invite.allowed_domain) {
    return { ok: false, reason: "DOMAIN_NOT_ALLOWED" };
  }

  return {
    ok: true,
    allowedDomain: invite.allowed_domain,
    remainingUses: invite.max_uses - invite.used_count,
  };
}

export function consumeInviteLink(
  db: AppDatabase,
  rawToken: string,
  input: {
    email: string;
    userId: string;
  },
) {
  const validation = validateInviteForEmail(db, rawToken, input.email);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const invite = getInviteByRawToken(db, rawToken);
  if (!invite) {
    throw new Error("INVITE_NOT_FOUND");
  }

  db.transaction(() => {
    db.query(
      `UPDATE invite_links
       SET used_count = used_count + 1
       WHERE id = ?`,
    ).run(invite.id);

    db.query(
      `INSERT INTO invite_link_uses (id, invite_link_id, email, user_id)
       VALUES (?, ?, ?, ?)`,
    ).run(randomUUID(), invite.id, normalizeEmail(input.email), input.userId);
  })();
}

export function ensureProfileForUser(
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

  db.query(
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
  ).run(input.userId, email, displayName, role, Date.now());

  const profile = db
    .query<ProfileRow, [string]>(
      `SELECT user_id, email, display_name, role
       FROM profiles
       WHERE user_id = ?`,
    )
    .get(input.userId);

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

export function parseAdminEmails(value = Bun.env.ADMIN_EMAILS ?? "") {
  return value.split(",").map(normalizeEmail).filter(Boolean);
}
