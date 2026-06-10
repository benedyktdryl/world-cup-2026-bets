import { Form, useNavigation } from "react-router";
import { Button } from "~/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import type { AuthActionResult } from "~/lib/server/auth-actions";

export function SignInForm({
  actionData,
  idPrefix = "sign-in",
}: {
  actionData?: AuthActionResult;
  idPrefix?: string;
}) {
  const navigation = useNavigation();
  const isSubmitting =
    navigation.state === "submitting" &&
    navigation.formMethod?.toLowerCase() === "post";

  return (
    <Form method="post" className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-email`}>Email</FieldLabel>
          <Input
            id={`${idPrefix}-email`}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-password`}>Password</FieldLabel>
          <Input
            id={`${idPrefix}-password`}
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

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign In"}
      </Button>

      <FieldDescription>
        New here? Use the invite link shared by your admin to create an account.
      </FieldDescription>
    </Form>
  );
}
