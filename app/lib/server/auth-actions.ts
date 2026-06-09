import { redirect } from "react-router";
import { z } from "zod";
import { auth } from "./auth";
import { createAppDatabase, runMigrations } from "./db";
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
  runMigrations(db);

  try {
    const invite = validateInviteForEmail(
      db,
      parsed.data.token,
      parsed.data.email,
    );
    if (!invite.ok) {
      return { error: inviteErrorMessage(invite.reason) };
    }

    const signup = await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.name,
      },
    });

    consumeInviteLink(db, parsed.data.token, {
      email: parsed.data.email,
      userId: signup.user.id,
    });
  } finally {
    db.close();
  }

  const response = await auth.api.signInEmail({
    body: {
      email: parsed.data.email,
      password: parsed.data.password,
      rememberMe: true,
    },
    asResponse: true,
  });

  if (!response.ok) {
    return redirect("/login");
  }

  return redirectWithAuthCookies(response, "/app");
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
