import { Badge } from "~/components/ui/badge";
import { Empty, EmptyContent, EmptyTitle } from "~/components/ui/empty";
import { MATCHES_ORDER_BY } from "~/lib/matches";
import { createAppDatabase, runMigrations } from "~/lib/server/db";
import { requireSession } from "~/lib/server/session";
import type { Route } from "./+types/app.bracket";

type BracketMatch = {
  id: string;
  stage: string;
  kickoff_at: number;
  home_team: string | null;
  away_team: string | null;
  home_goals: number | null;
  away_goals: number | null;
  status: string;
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireSession(request);
  const db = createAppDatabase();
  runMigrations(db);

  try {
    const matches = db
      .query<BracketMatch, []>(
        `SELECT
          matches.id,
          matches.stage,
          matches.kickoff_at,
          matches.home_goals,
          matches.away_goals,
          matches.status,
          home.name AS home_team,
          away.name AS away_team
        FROM matches
        LEFT JOIN teams home ON home.id = matches.home_team_id
        LEFT JOIN teams away ON away.id = matches.away_team_id
        WHERE matches.stage != 'GROUP'
        ORDER BY ${MATCHES_ORDER_BY}`,
      )
      .all();

    const rounds = new Map<string, BracketMatch[]>();
    for (const match of matches) {
      const roundMatches = rounds.get(match.stage) ?? [];
      roundMatches.push(match);
      rounds.set(match.stage, roundMatches);
    }

    return { rounds: [...rounds.entries()] };
  } finally {
    db.close();
  }
}

export default function Bracket({ loaderData }: Route.ComponentProps) {
  if (!loaderData.rounds.length) {
    return (
      <Empty className="rounded-2xl border">
        <EmptyContent>
          <EmptyTitle>No Knockout Matches Yet</EmptyTitle>
          <p className="text-muted-foreground">
            The bracket appears once knockout fixtures are crawled or added.
          </p>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <section className="overflow-x-auto rounded-2xl border bg-card p-5 text-card-foreground">
      <div className="flex min-w-[52rem] gap-6">
        {loaderData.rounds.map(([round, matches]) => (
          <div key={round} className="flex min-w-64 flex-1 flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-xl tracking-tight">{round}</h2>
              <Badge variant="secondary">{matches.length}</Badge>
            </div>
            <div className="flex flex-1 flex-col justify-around gap-4">
              {matches.map((match) => (
                <article
                  key={match.id}
                  className="relative rounded-2xl border bg-background/70 p-4 shadow-sm"
                >
                  <div className="absolute top-1/2 right-[-1.5rem] hidden h-px w-6 bg-border lg:block" />
                  <p className="mb-3 text-muted-foreground text-xs">
                    {new Intl.DateTimeFormat(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(match.kickoff_at))}
                  </p>
                  {[
                    {
                      side: "home",
                      team: match.home_team ?? "TBD",
                      goals: match.home_goals,
                    },
                    {
                      side: "away",
                      team: match.away_team ?? "TBD",
                      goals: match.away_goals,
                    },
                  ].map(({ side, team, goals }) => (
                    <div
                      key={side}
                      className="flex items-center justify-between border-b py-2 last:border-b-0"
                    >
                      <span className="min-w-0 truncate font-medium">
                        {team}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {goals ?? "-"}
                      </span>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
