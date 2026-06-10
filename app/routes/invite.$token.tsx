import { Form, Link, redirect, useActionData } from "react-router";
import { Button } from "~/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  type AuthActionResult,
  signUpFromInviteForm,
} from "~/lib/server/auth-actions";
import { getCurrentSession } from "~/lib/server/session";
import type { Route } from "./+types/invite.$token";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Join Contest | World Cup Bets" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);
  if (session) {
    throw redirect("/app");
  }

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  return signUpFromInviteForm(await request.formData());
}

export default function InviteSignup({ params }: Route.ComponentProps) {
  const actionData = useActionData<AuthActionResult>();

  return (
    <main
      id="main-content"
      className="flex min-h-svh items-center justify-center px-6"
    >
      <section className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.25em]">
            Invite Link
          </p>
          <h1 className="font-semibold text-3xl tracking-tight">
            Join World Cup Bets
          </h1>
          <p className="text-muted-foreground text-sm">
            Create your account with the email domain this invite was issued
            for.
          </p>
        </div>

        <Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="token" value={params.token} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" name="name" autoComplete="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <FieldDescription>Use at least 8 characters.</FieldDescription>
            </Field>
          </FieldGroup>

          {actionData?.error ? (
            <div
              aria-live="polite"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"
            >
              <p className="text-destructive">{actionData.error}</p>
              {actionData.error.includes("already exists") ? (
                <p className="mt-2 text-muted-foreground">
                  Your account may have been created on a previous attempt.
                </p>
              ) : null}
            </div>
          ) : null}

          <Button type="submit" size="lg">
            Create Account
          </Button>
        </Form>

        <Button asChild variant="ghost">
          <Link to="/#sign-in">Already Have An Account?</Link>
        </Button>
      </section>
    </main>
  );
}
