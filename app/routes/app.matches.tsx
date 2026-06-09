import { Form, useActionData } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Empty, EmptyContent, EmptyTitle } from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { upsertBet } from "~/lib/server/betting";
import { createAppDatabase, runMigrations } from "~/lib/server/db";
import { requireSession } from "~/lib/server/session";
import type { Route } from "./+types/app.matches";

type MatchRow = {
  id: string;
  kickoff_at: number;
  stage: string;
  group_code: string | null;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  home_team: string | null;
  away_team: string | null;
  predicted_home_goals: number | null;
  predicted_away_goals: number | null;
};

type ActionResult = { error?: string; ok?: boolean };

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireSession(request);
  const db = createAppDatabase();
  runMigrations(db);

  try {
    const matches = db
      .query<MatchRow, [string]>(
        `SELECT
          matches.id,
          matches.kickoff_at,
          matches.stage,
          matches.group_code,
          matches.status,
          matches.home_goals,
          matches.away_goals,
          home.name AS home_team,
          away.name AS away_team,
          bets.predicted_home_goals,
          bets.predicted_away_goals
        FROM matches
        LEFT JOIN teams home ON home.id = matches.home_team_id
        LEFT JOIN teams away ON away.id = matches.away_team_id
        LEFT JOIN bets
          ON bets.match_id = matches.id AND bets.user_id = ?
        ORDER BY matches.kickoff_at ASC`,
      )
      .all(session.user.id);
    return { matches };
  } finally {
    db.close();
  }
}

export async function action({ request }: Route.ActionArgs) {
  const session = await requireSession(request);
  const formData = await request.formData();
  const matchId = String(formData.get("matchId") ?? "");
  const predictedHomeGoals = Number(formData.get("predictedHomeGoals"));
  const predictedAwayGoals = Number(formData.get("predictedAwayGoals"));

  if (
    !matchId ||
    !Number.isInteger(predictedHomeGoals) ||
    !Number.isInteger(predictedAwayGoals) ||
    predictedHomeGoals < 0 ||
    predictedAwayGoals < 0
  ) {
    return { error: "Enter valid non-negative scores." };
  }

  const db = createAppDatabase();
  runMigrations(db);
  try {
    upsertBet(db, {
      userId: session.user.id,
      matchId,
      predictedHomeGoals,
      predictedAwayGoals,
    });
    return { ok: true };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message === "MATCH_LOCKED"
          ? "This match has already kicked off."
          : "Could not save this bet.",
    };
  } finally {
    db.close();
  }
}

export default function Matches({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionResult>();

  if (!loaderData.matches.length) {
    return (
      <Empty className="rounded-2xl border">
        <EmptyContent>
          <EmptyTitle>No Matches Yet</EmptyTitle>
          <p className="text-muted-foreground">
            Ask an admin to crawl Flashscore or add fixtures.
          </p>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {actionData?.error ? (
        <p aria-live="polite" className="text-destructive text-sm">
          {actionData.error}
        </p>
      ) : null}
      {actionData?.ok ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          Bet saved.
        </p>
      ) : null}
      {loaderData.matches.map((match) => {
        const locked = Date.now() >= match.kickoff_at;
        const homeInputId = `${match.id}-predicted-home`;
        const awayInputId = `${match.id}-predicted-away`;
        return (
          <article
            key={match.id}
            className="grid gap-4 rounded-2xl border bg-card p-5 text-card-foreground lg:grid-cols-[1fr_auto]"
          >
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{match.stage}</Badge>
                {match.group_code ? (
                  <Badge variant="outline">Group {match.group_code}</Badge>
                ) : null}
                <span className="text-muted-foreground text-sm">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(match.kickoff_at))}
                </span>
              </div>
              <div className="grid gap-2 text-2xl sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <span className="truncate font-semibold">
                  {match.home_team ?? "TBD"}
                </span>
                <span className="text-muted-foreground text-sm">vs</span>
                <span className="truncate font-semibold sm:text-right">
                  {match.away_team ?? "TBD"}
                </span>
              </div>
              {match.status === "FINISHED" ? (
                <p className="font-semibold tabular-nums">
                  Final: {match.home_goals}-{match.away_goals}
                </p>
              ) : null}
            </div>
            <Form method="post" className="flex items-end gap-2">
              <input type="hidden" name="matchId" value={match.id} />
              <label
                htmlFor={homeInputId}
                className="flex flex-col gap-1 text-sm"
              >
                Home
                <Input
                  id={homeInputId}
                  name="predictedHomeGoals"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  defaultValue={match.predicted_home_goals ?? ""}
                  disabled={locked}
                  className="w-20"
                  aria-label="Predicted home goals"
                />
              </label>
              <label
                htmlFor={awayInputId}
                className="flex flex-col gap-1 text-sm"
              >
                Away
                <Input
                  id={awayInputId}
                  name="predictedAwayGoals"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  defaultValue={match.predicted_away_goals ?? ""}
                  disabled={locked}
                  className="w-20"
                  aria-label="Predicted away goals"
                />
              </label>
              <Button type="submit" disabled={locked}>
                {locked ? "Locked" : "Save"}
              </Button>
            </Form>
          </article>
        );
      })}
    </section>
  );
}
