import { redirect } from "react-router";
import { z } from "zod";
import { auth } from "./auth";
import { createAppDatabase, ensureMigrations } from "./db";
import { consumeInviteLink, validateInviteForEmail } from "./invites";

const emailSchema = z.email().transform((value) => value.trim().toLowerCase());

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.");

export const loginFormSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const inviteSignupFormSchema = loginFormSchema.extend({
  name: z.string().trim().min(1, "Name is required."),
  token: z.string().trim().min(1, "Invite token is required."),
});

export type AuthActionResult = {
  error?: string;
};

export function formatAuthActionError(error: unknown) {
  if (error instanceof Error && isInviteFailureReason(error.message)) {
    return inviteErrorMessage(error.message);
  }

  if (error && typeof error === "object") {
    const record = error as {
      body?: { code?: string; message?: string };
      message?: string;
    };

    if (
      record.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
      record.body?.message?.toLowerCase().includes("already exists")
    ) {
      return "An account with this email already exists. Sign in instead.";
    }

    if (record.body?.message) {
      return record.body.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Could not complete signup. Try again or sign in.";
}

export async function signOutFromSession(request: Request) {
  const response = await auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  });
  const headers = new Headers(response.headers);
  headers.set("Location", "/");
  return new Response(null, {
    status: 303,
    headers,
  });
}

function redirectWithAuthCookies(authResponse: Response, location: string) {
  const headers = new Headers(authResponse.headers);
  headers.set("Location", location);
  return new Response(null, {
    status: 303,
    headers,
  });
}

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signInFromForm(formData: FormData) {
  const parsed = loginFormSchema.safeParse({
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid login." };
  }

  try {
    const response = await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        rememberMe: true,
      },
      asResponse: true,
    });

    if (!response.ok) {
      return { error: "Email or password is incorrect." };
    }

    return redirectWithAuthCookies(response, "/app");
  } catch (error) {
    console.error("sign in failed:", formatAuthActionError(error));
    return { error: formatAuthActionError(error) };
  }
}

export async function signUpFromInviteForm(formData: FormData) {
  const parsed = inviteSignupFormSchema.safeParse({
    email: formValue(formData, "email"),
    name: formValue(formData, "name"),
    password: formValue(formData, "password"),
    token: formValue(formData, "token"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid signup." };
  }

  const db = createAppDatabase();
  await ensureMigrations(db);

  const invite = await validateInviteForEmail(
    db,
    parsed.data.token,
    parsed.data.email,
  );
  if (!invite.ok) {
    return { error: inviteErrorMessage(invite.reason) };
  }

  try {
    const signup = await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.name,
      },
    });

    await consumeInviteLink(db, parsed.data.token, {
      email: parsed.data.email,
      userId: signup.user.id,
    });

    const response = await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        rememberMe: true,
      },
      asResponse: true,
    });

    if (!response.ok) {
      return redirect("/");
    }

    return redirectWithAuthCookies(response, "/app");
  } catch (error) {
    console.error("invite signup failed:", formatAuthActionError(error));
    return { error: formatAuthActionError(error) };
  }
}

function isInviteFailureReason(reason: string) {
  return (
    reason === "DOMAIN_NOT_ALLOWED" ||
    reason === "INVITE_EXPIRED" ||
    reason === "INVITE_EXHAUSTED" ||
    reason === "INVITE_NOT_FOUND"
  );
}

function inviteErrorMessage(reason: string) {
  switch (reason) {
    case "DOMAIN_NOT_ALLOWED":
      return "Use the email domain this invite was created for.";
    case "INVITE_EXPIRED":
      return "This invite link has expired. Ask an admin for a new one.";
    case "INVITE_EXHAUSTED":
      return "This invite link has already been used.";
    default:
      return "This invite link is not valid.";
  }
}
