import { describe, expect, test } from "bun:test";
import { formatAuthActionError } from "./auth-actions";

describe("auth actions", () => {
  test("formatAuthActionError maps duplicate signup to a friendly message", () => {
    expect(
      formatAuthActionError({
        body: {
          code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
          message: "User already exists. Use another email.",
        },
      }),
    ).toBe("An account with this email already exists. Sign in instead.");
  });

  test("formatAuthActionError maps invite consumption errors", () => {
    expect(formatAuthActionError(new Error("INVITE_EXHAUSTED"))).toBe(
      "This invite link has already been used.",
    );
  });
});
