import { Form, useActionData, useLoaderData } from "react-router";
import { InviteCopyButton } from "~/components/invite-copy-button";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { requireAdmin } from "~/lib/server/admin";
import { withDatabase } from "~/lib/server/db";
import {
  createInviteLink,
  getDefaultInviteDomain,
  listInviteLinks,
  parseAllowedEmailDomains,
} from "~/lib/server/invites";
import type { Route } from "./+types/admin.invites";

type ActionResult = {
  inviteUrl?: string;
  error?: string;
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  return withDatabase(async (db) => ({
    invites: await listInviteLinks(db),
    globalDomains: parseAllowedEmailDomains(),
    defaultDomain: getDefaultInviteDomain(),
  }));
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireAdmin(request);
  const formData = await request.formData();
  const allowedDomain = String(formData.get("allowedDomain") ?? "").trim();
  const maxUses = Number(formData.get("maxUses") ?? "25");

  if (!allowedDomain) {
    return { error: "Allowed domain is required." };
  }

  return withDatabase(async (db) => {
    const invite = await createInviteLink(db, {
      allowedDomain,
      maxUses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : 25,
      createdByUserId: session.user.id,
    });
    const inviteUrl = new URL(`/invite/${invite.rawToken}`, request.url);
    return { inviteUrl: inviteUrl.toString() };
  });
}

function formatDate(timestamp: number | null) {
  if (timestamp == null) {
    return "Never";
  }

  return new Date(timestamp).toLocaleString();
}

export default function AdminInvites() {
  const actionData = useActionData<ActionResult>();
  const { invites, globalDomains, defaultDomain } =
    useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <AlertTitle>How invites work</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>
            Create one shared link for your team. Set <strong>max uses</strong>{" "}
            to your headcount (e.g. 25) and restrict signups to your company
            email domain (e.g. <code>acme.com</code>).
          </span>
          <span>
            There is no per-person email list and no email verification yet —
            anyone with the link can register if their email matches the domain.
            For a small office pool that is usually enough; add SMTP later if
            you need verified inboxes.
          </span>
          {globalDomains.length > 0 ? (
            <span>
              Server also limits signups to:{" "}
              {globalDomains.map((domain) => (
                <Badge key={domain} variant="secondary" className="mr-1">
                  @{domain}
                </Badge>
              ))}
            </span>
          ) : null}
        </AlertDescription>
      </Alert>

      <section className="flex max-w-xl flex-col gap-6 rounded-2xl border bg-card p-6 text-card-foreground">
        <div>
          <h2 className="font-semibold text-2xl tracking-tight">
            Create invite link
          </h2>
          <p className="text-muted-foreground text-sm">
            The raw URL is shown once after creation — copy it immediately.
          </p>
        </div>
        <Form method="post" className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="allowedDomain">Allowed domain</FieldLabel>
              <Input
                id="allowedDomain"
                name="allowedDomain"
                placeholder="example.com"
                defaultValue={defaultDomain}
                autoComplete="off"
                required
              />
              <FieldDescription>
                Signups must use an email on this domain.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="maxUses">Maximum uses</FieldLabel>
              <Input
                id="maxUses"
                name="maxUses"
                type="number"
                inputMode="numeric"
                min={1}
                defaultValue={25}
                autoComplete="off"
                required
              />
              <FieldDescription>
                One shared link for the whole team — set this to your expected
                signup count.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {actionData?.error ? (
            <p aria-live="polite" className="text-destructive text-sm">
              {actionData.error}
            </p>
          ) : null}
          {actionData?.inviteUrl ? (
            <div
              aria-live="polite"
              className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4"
            >
              <p className="font-medium text-sm">New invite link</p>
              <p className="break-all font-mono text-sm">
                {actionData.inviteUrl}
              </p>
              <InviteCopyButton value={actionData.inviteUrl} />
            </div>
          ) : null}
          <Button type="submit">Create invite</Button>
        </Form>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6 text-card-foreground">
        <div>
          <h2 className="font-semibold text-2xl tracking-tight">
            Existing invites
          </h2>
          <p className="text-muted-foreground text-sm">
            Tokens are stored hashed — you cannot recover old URLs from this
            list.
          </p>
        </div>
        {invites.length === 0 ? (
          <p className="text-muted-foreground text-sm">No invites yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Uses</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite) => (
                <TableRow key={invite.id}>
                  <TableCell>@{invite.allowedDomain}</TableCell>
                  <TableCell>
                    {invite.usedCount} / {invite.maxUses}
                  </TableCell>
                  <TableCell>{formatDate(invite.expiresAt)}</TableCell>
                  <TableCell>{formatDate(invite.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
