import { Badge } from "~/components/ui/badge";
import { MATCHES_ORDER_BY } from "~/lib/matches";
import { getLeaderboard } from "~/lib/server/betting";
import { withDatabase } from "~/lib/server/db";
import { requireSession } from "~/lib/server/session";
import { sqlGet } from "~/lib/server/sql";
import type { Route } from "./+types/app.dashboard";

type CountRow = { total: number };
type NextMatchRow = {
  id: string;
  kickoff_at: number;
  home_team: string | null;
  away_team: string | null;
};

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireSession(request);

  return withDatabase(async (db) => {
    const matches =
      (await sqlGet<CountRow>(db, "SELECT COUNT(*) AS total FROM matches"))
        ?.total ?? 0;
    const bets =
      (
        await sqlGet<CountRow>(
          db,
          "SELECT COUNT(*) AS total FROM bets WHERE user_id = ?",
          [session.user.id],
        )
      )?.total ?? 0;
    const exact =
      (
        await sqlGet<CountRow>(
          db,
          "SELECT COUNT(*) AS total FROM scores WHERE user_id = ? AND reason = 'EXACT'",
          [session.user.id],
        )
      )?.total ?? 0;
    const nextMatch = await sqlGet<NextMatchRow>(
      db,
      `SELECT
        matches.id,
        matches.kickoff_at,
        home.name AS home_team,
        away.name AS away_team
      FROM matches
      LEFT JOIN teams home ON home.id = matches.home_team_id
      LEFT JOIN teams away ON away.id = matches.away_team_id
      WHERE matches.status = 'SCHEDULED'
      ORDER BY ${MATCHES_ORDER_BY}
      LIMIT 1`,
    );

    return {
      matches,
      bets,
      exact,
      nextMatch,
      leaders: (await getLeaderboard(db)).slice(0, 5),
    };
  });
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const nextMatchTitle = loaderData.nextMatch
    ? `${loaderData.nextMatch.home_team ?? "TBD"} vs ${
        loaderData.nextMatch.away_team ?? "TBD"
      }`
    : "No fixtures yet";

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Matches", loaderData.matches],
          ["My Bets", loaderData.bets],
          ["Exact Hits", loaderData.exact],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border bg-card p-5 text-card-foreground"
          >
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="font-semibold text-4xl tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-5 text-card-foreground">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">Next Kickoff</p>
          <Badge variant="secondary">Live Soon</Badge>
        </div>
        <p className="mt-6 font-semibold text-3xl tracking-tight">
          {nextMatchTitle}
        </p>
        {loaderData.nextMatch ? (
          <p className="mt-2 text-muted-foreground">
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(loaderData.nextMatch.kickoff_at))}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-card p-5 text-card-foreground lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-2xl tracking-tight">
            Leaderboard Pulse
          </h2>
          <Badge>Top 5</Badge>
        </div>
        <div className="mt-5 grid gap-3">
          {loaderData.leaders.length ? (
            loaderData.leaders.map((leader, index) => (
              <div
                key={leader.userId}
                className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="tabular-nums text-muted-foreground">
                    #{index + 1}
                  </span>
                  <span className="truncate font-medium">
                    {leader.displayName}
                  </span>
                </div>
                <span className="font-semibold tabular-nums">
                  {leader.points} pts
                </span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">
              Place bets and settle matches to start the leaderboard.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
