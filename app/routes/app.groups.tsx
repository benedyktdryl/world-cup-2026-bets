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
import { withDatabase } from "~/lib/server/db";
import { requireSession } from "~/lib/server/session";
import {
  buildGroupStandings,
  type FinishedGroupMatch,
} from "~/lib/server/standings";
import { sqlAll } from "~/lib/server/sql";
import type { Route } from "./+types/app.groups";

export async function loader({ request }: Route.LoaderArgs) {
  await requireSession(request);

  return withDatabase(async (db) => {
    const matches = await sqlAll<FinishedGroupMatch>(
      db,
      `SELECT
        matches.group_code AS groupCode,
        matches.home_team_id AS homeTeamId,
        home.name AS homeTeamName,
        matches.away_team_id AS awayTeamId,
        away.name AS awayTeamName,
        matches.home_goals AS homeGoals,
        matches.away_goals AS awayGoals
      FROM matches
      JOIN teams home ON home.id = matches.home_team_id
      JOIN teams away ON away.id = matches.away_team_id
      WHERE matches.status = 'FINISHED'
        AND matches.stage = 'GROUP'
        AND matches.group_code IS NOT NULL
        AND matches.home_goals IS NOT NULL
        AND matches.away_goals IS NOT NULL`,
    );
    return { groups: buildGroupStandings(matches) };
  });
}

export default function Groups({ loaderData }: Route.ComponentProps) {
  if (!loaderData.groups.length) {
    return (
      <Empty className="rounded-2xl border">
        <EmptyContent>
          <EmptyTitle>No Group Results Yet</EmptyTitle>
          <p className="text-muted-foreground">
            Group tables appear after finished group matches are crawled.
          </p>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {loaderData.groups.map((group) => (
        <div
          key={group.groupCode}
          className="rounded-2xl border bg-card p-5 text-card-foreground"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-2xl tracking-tight">
              Group {group.groupCode}
            </h2>
            <Badge variant="secondary">{group.teams.length} Teams</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">P</TableHead>
                <TableHead className="text-right">GD</TableHead>
                <TableHead className="text-right">Pts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.teams.map((team) => (
                <TableRow key={team.teamId}>
                  <TableCell className="font-medium">{team.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {team.played}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {team.goalDifference}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {team.points}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </section>
  );
}
