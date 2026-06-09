import { useActionData } from "react-router";
import { MatchesDataTable } from "~/components/matches-data-table";
import { Empty, EmptyContent, EmptyTitle } from "~/components/ui/empty";
import { MATCHES_ORDER_BY } from "~/lib/matches";
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

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Matches | World Cup Bets" }];
}

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
        ORDER BY ${MATCHES_ORDER_BY}`,
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
      <Empty className="rounded-xl border">
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
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-3xl tracking-tight">Matches</h1>
        <p className="text-muted-foreground text-sm">
          Predict scores before kickoff. Exact scores earn 3 points, correct
          result earns 1.
        </p>
      </div>
      {actionData?.error ? (
        <p aria-live="polite" className="text-destructive text-sm">
          {actionData.error}
        </p>
      ) : null}
      {actionData?.ok ? (
        <p aria-live="polite" className="text-muted-foreground text-sm">
          Bet saved.
        </p>
      ) : null}
      <MatchesDataTable matches={loaderData.matches} />
    </section>
  );
}
