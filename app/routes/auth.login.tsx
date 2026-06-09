import { Form, Link, useActionData } from "react-router";
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
  signInFromForm,
} from "~/lib/server/auth-actions";
import type { Route } from "./+types/auth.login";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Sign In | World Cup Bets" }];
}

export async function action({ request }: Route.ActionArgs) {
  return signInFromForm(await request.formData());
}

export default function Login() {
  const actionData = useActionData<AuthActionResult>();

  return (
    <main
      id="main-content"
      className="flex min-h-svh items-center justify-center px-6"
    >
      <section className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.25em]">
            World Cup Bets
          </p>
          <h1 className="font-semibold text-3xl tracking-tight">Sign In</h1>
          <p className="text-muted-foreground text-sm">
            Use the account you created from your invite link.
          </p>
        </div>

        <Form method="post" className="flex flex-col gap-4">
          <FieldGroup>
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
                autoComplete="current-password"
                required
              />
            </Field>
          </FieldGroup>

          {actionData?.error ? (
            <p aria-live="polite" className="text-destructive text-sm">
              {actionData.error}
            </p>
          ) : null}

          <Button type="submit" size="lg">
            Sign In
          </Button>

          <FieldDescription>
            Need access? Open the invite link shared by an admin.
          </FieldDescription>
        </Form>

        <Button asChild variant="ghost">
          <Link to="/">Back To Home</Link>
        </Button>
      </section>
    </main>
  );
}
