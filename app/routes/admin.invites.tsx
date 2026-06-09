import { Form, useActionData } from "react-router";
import { Button } from "~/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { requireAdmin } from "~/lib/server/admin";
import { createAppDatabase, runMigrations } from "~/lib/server/db";
import { createInviteLink } from "~/lib/server/invites";
import type { Route } from "./+types/admin.invites";

type ActionResult = {
  inviteUrl?: string;
  error?: string;
};

export async function action({ request }: Route.ActionArgs) {
  const session = await requireAdmin(request);
  const formData = await request.formData();
  const allowedDomain = String(formData.get("allowedDomain") ?? "").trim();
  const maxUses = Number(formData.get("maxUses") ?? "1");

  if (!allowedDomain) {
    return { error: "Allowed domain is required." };
  }

  const db = createAppDatabase();
  runMigrations(db);
  try {
    const invite = createInviteLink(db, {
      allowedDomain,
      maxUses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : 1,
      createdByUserId: session.user.id,
    });
    const inviteUrl = new URL(`/invite/${invite.rawToken}`, request.url);
    return { inviteUrl: inviteUrl.toString() };
  } finally {
    db.close();
  }
}

export default function AdminInvites() {
  const actionData = useActionData<ActionResult>();

  return (
    <section className="flex max-w-xl flex-col gap-6 rounded-2xl border bg-card p-6 text-card-foreground">
      <div>
        <h2 className="font-semibold text-2xl tracking-tight">
          Create Invite Link
        </h2>
        <p className="text-muted-foreground text-sm">
          Generate a link and send it manually to colleagues on the allowed
          email domain.
        </p>
      </div>
      <Form method="post" className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="allowedDomain">Allowed Domain</FieldLabel>
            <Input
              id="allowedDomain"
              name="allowedDomain"
              placeholder="example.com…"
              autoComplete="off"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="maxUses">Maximum Uses</FieldLabel>
            <Input
              id="maxUses"
              name="maxUses"
              type="number"
              inputMode="numeric"
              min={1}
              defaultValue={1}
              autoComplete="off"
              required
            />
            <FieldDescription>
              Use 1 for personal links, or a larger number for a shared link.
            </FieldDescription>
          </Field>
        </FieldGroup>
        {actionData?.error ? (
          <p aria-live="polite" className="text-destructive text-sm">
            {actionData.error}
          </p>
        ) : null}
        {actionData?.inviteUrl ? (
          <p aria-live="polite" className="break-words text-sm">
            {actionData.inviteUrl}
          </p>
        ) : null}
        <Button type="submit">Create Invite</Button>
      </Form>
    </section>
  );
}
