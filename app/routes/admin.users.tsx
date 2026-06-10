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
import { getRegisteredUserStats } from "~/lib/server/admin-users";
import { withDatabase } from "~/lib/server/db";
import type { Route } from "./+types/admin.users";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  return withDatabase(async (db) => getRegisteredUserStats(db));
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export default function AdminUsers({ loaderData }: Route.ComponentProps) {
  const { users, summary } = loaderData;

  return (
    <div className="flex flex-col gap-6">
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
            Bets filled out of all crawled fixtures. Open-column uses matches
            still unlocked for predictions.
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
