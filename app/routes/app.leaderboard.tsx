import { Badge } from "~/components/ui/badge";
import { Empty, EmptyContent, EmptyTitle } from "~/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { getLeaderboard } from "~/lib/server/betting";
import { createAppDatabase, runMigrations } from "~/lib/server/db";
import { requireSession } from "~/lib/server/session";
import type { Route } from "./+types/app.leaderboard";

export async function loader({ request }: Route.LoaderArgs) {
  await requireSession(request);
  const db = createAppDatabase();
  runMigrations(db);

  try {
    return { leaderboard: getLeaderboard(db) };
  } finally {
    db.close();
  }
}

export default function Leaderboard({ loaderData }: Route.ComponentProps) {
  const rows = loaderData.leaderboard.filter((row) => row.totalBets > 0);

  if (!rows.length) {
    return (
      <Empty className="rounded-2xl border">
        <EmptyContent>
          <EmptyTitle>No Scores Yet</EmptyTitle>
          <p className="text-muted-foreground">
            Scores appear after users place bets and matches finish.
          </p>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <section className="rounded-2xl border bg-card p-5 text-card-foreground">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-semibold text-2xl tracking-tight">Leaderboard</h2>
        <Badge>{rows.length} Players</Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>Player</TableHead>
            <TableHead className="text-right">Points</TableHead>
            <TableHead className="text-right">Exact</TableHead>
            <TableHead className="text-right">Result</TableHead>
            <TableHead className="text-right">Settled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.userId}>
              <TableCell className="text-muted-foreground tabular-nums">
                #{index + 1}
              </TableCell>
              <TableCell className="font-medium">{row.displayName}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {row.points}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.exactScores}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.resultHits}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.totalBets}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
