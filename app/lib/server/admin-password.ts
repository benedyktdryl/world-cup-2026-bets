import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { AppDatabase } from "./db";
import { sqlGet, sqlRun } from "./sql";

const MIN_PASSWORD_LENGTH = 8;

type CredentialAccountRow = {
  id: string;
};

export function generateTemporaryPassword() {
  return randomBytes(12).toString("base64url");
}

export function validateNewPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return null;
}

export async function resetUserPassword(
  db: AppDatabase,
  input: {
    userId: string;
    newPassword: string;
  },
) {
  const validationError = validateNewPassword(input.newPassword);
  if (validationError) {
    throw new Error(validationError);
  }

  const account = await sqlGet<CredentialAccountRow>(
    db,
    `SELECT id
     FROM account
     WHERE userId = ? AND providerId = 'credential'`,
    [input.userId],
  );

  if (!account) {
    throw new Error("USER_HAS_NO_PASSWORD_ACCOUNT");
  }

  const hashedPassword = await hashPassword(input.newPassword);
  const updatedAt = Date.now();

  await sqlRun(
    db,
    `UPDATE account
     SET password = ?, updatedAt = ?
     WHERE userId = ? AND providerId = 'credential'`,
    [hashedPassword, updatedAt, input.userId],
  );

  await sqlRun(db, `DELETE FROM session WHERE userId = ?`, [input.userId]);

  return { userId: input.userId };
}
