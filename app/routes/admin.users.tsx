import { useActionData } from "react-router";
import { InviteCopyButton } from "~/components/invite-copy-button";
import { ResetUserPasswordForm } from "~/components/reset-user-password-form";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { requireAdmin } from "~/lib/server/admin";
import {
  generateTemporaryPassword,
  resetUserPassword,
  validateNewPassword,
} from "~/lib/server/admin-password";
import { getRegisteredUserStats } from "~/lib/server/admin-users";
import { withDatabase } from "~/lib/server/db";
import type { Route } from "./+types/admin.users";

type ActionResult = {
  error?: string;
  passwordReset?: {
    email: string;
    password: string;
  };
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  return withDatabase(async (db) => getRegisteredUserStats(db));
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();

  if (formData.get("intent") !== "reset-password") {
    return { error: "Unknown action." };
  }

  const userId = String(formData.get("userId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const manualPassword = String(formData.get("newPassword") ?? "").trim();
  const newPassword = manualPassword || generateTemporaryPassword();

  const validationError = validateNewPassword(newPassword);
  if (validationError) {
    return { error: validationError };
  }

  if (!userId) {
    return { error: "User is required." };
  }

  try {
    await withDatabase((db) => resetUserPassword(db, { userId, newPassword }));
    return {
      passwordReset: {
        email: email || userId,
        password: newPassword,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message === "USER_HAS_NO_PASSWORD_ACCOUNT") {
      return { error: "This user has no email/password login to reset." };
    }

    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not reset the password.",
    };
  }
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export default function AdminUsers({ loaderData }: Route.ComponentProps) {
  const { users, summary } = loaderData;
  const actionData = useActionData<ActionResult>();

  return (
    <div className="flex flex-col gap-6">
      {actionData?.error ? (
        <p aria-live="polite" className="text-destructive text-sm">
          {actionData.error}
        </p>
      ) : null}
      {actionData?.passwordReset ? (
        <div
          aria-live="polite"
          className="rounded-xl border bg-muted/40 p-4 text-sm"
        >
          <p className="font-medium">Password updated</p>
          <p className="mt-1 text-muted-foreground">
            Share these credentials privately with {actionData.passwordReset.email}
            . Copy now — this is shown once.
          </p>
          <p className="mt-3 break-all font-mono">
            {actionData.passwordReset.password}
          </p>
          <div className="mt-3">
            <InviteCopyButton
              value={actionData.passwordReset.password}
              label="Copy password"
            />
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Registered users", summary.totalUsers],
          ["Total fixtures", summary.totalMatches],
          ["Open for betting", summary.openMatches],
          ["Avg. completion", `${summary.averageCompletionPercent}%`],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border bg-card p-5 text-card-foreground"
          >
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="font-semibold text-3xl tabular-nums tracking-tight">
              {value}
            </p>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6 text-card-foreground">
        <div>
          <h2 className="font-semibold text-2xl tracking-tight">
            Registered users
          </h2>
          <p className="text-muted-foreground text-sm">
            Bets filled out of all crawled fixtures. Password resets keep the
            same account, bets, and points — only the login password changes.
          </p>
        </div>

        {users.length === 0 ? (
          <p className="text-muted-foreground text-sm">No users yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Bets</TableHead>
                <TableHead>Completion</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right">Exact</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.userId}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{user.displayName}</span>
                      <span className="text-muted-foreground text-xs">
                        {user.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.role === "ADMIN" ? "default" : "secondary"}
                    >
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {user.betsPlaced} / {summary.totalMatches}
                    <span className="mt-1 block text-muted-foreground text-xs">
                      {user.betsPlaced} / {summary.openMatches} open
                    </span>
                  </TableCell>
                  <TableCell className="min-w-40">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="tabular-nums">
                          {user.completionPercent}%
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {user.openCompletionPercent}% open
                        </span>
                      </div>
                      <Progress value={user.completionPercent} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {user.points}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {user.exactScores}
                  </TableCell>
                  <TableCell className="text-right">
                    <ResetUserPasswordForm
                      userId={user.userId}
                      email={user.email}
                      displayName={user.displayName}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
