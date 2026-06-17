import {
  CalendarClock,
  Crosshair,
  Radio,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import {
  PointsTrendChart,
  PoolTrendChart,
  PredictionBreakdownChart,
} from "~/components/dashboard-charts";
import { Badge } from "~/components/ui/badge";
import { getDashboardData } from "~/lib/server/dashboard";
import { withDatabase } from "~/lib/server/db";
import { requireSession } from "~/lib/server/session";
import type { Route } from "./+types/app.dashboard";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireSession(request);

  return withDatabase(async (db) => getDashboardData(db, session.user.id));
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const reasonLabels = {
  EXACT: "Exact hit",
  RESULT: "Result hit",
  MISS: "Miss",
} as const;

function reasonBadgeVariant(reason: keyof typeof reasonLabels) {
  if (reason === "EXACT") {
    return "default" as const;
  }
  if (reason === "RESULT") {
    return "secondary" as const;
  }
  return "outline" as const;
}

function SpotlightCard({
  spotlight,
}: {
  spotlight: Awaited<ReturnType<typeof loader>>["spotlight"];
}) {
  if (!spotlight) {
    return (
      <div className="relative overflow-hidden rounded-2xl border bg-card p-6 text-card-foreground">
        <p className="font-medium text-muted-foreground text-sm">
          Match spotlight
        </p>
        <p className="mt-4 font-semibold text-2xl tracking-tight">
          No fixtures yet
        </p>
      </div>
    );
  }

  const { match } = spotlight;
  const title = `${match.home_team ?? "TBD"} vs ${match.away_team ?? "TBD"}`;

  const badge =
    spotlight.kind === "live" ? (
      <Badge className="gap-1 bg-red-500/15 text-red-700 hover:bg-red-500/15 dark:text-red-300">
        <Radio className="size-3" />
        Live now
      </Badge>
    ) : spotlight.kind === "upcoming" ? (
      <Badge variant="secondary" className="gap-1">
        <CalendarClock className="size-3" />
        Next kickoff
      </Badge>
    ) : (
      <Badge variant="outline">Latest result</Badge>
    );

  const score =
    spotlight.kind === "recent" &&
    match.home_goals != null &&
    match.away_goals != null ? (
      <p className="mt-3 font-semibold text-4xl tabular-nums tracking-tight">
        {match.home_goals} – {match.away_goals}
      </p>
    ) : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 text-card-foreground">
      <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-3">
        <p className="font-medium text-muted-foreground text-sm">
          Match spotlight
        </p>
        {badge}
      </div>
      <p className="relative mt-5 font-semibold text-3xl tracking-tight">
        {title}
      </p>
      {score}
      <p className="relative mt-2 text-muted-foreground">
        {dateFormatter.format(new Date(match.kickoff_at))}
      </p>
    </div>
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { stats } = loaderData;
  const maxLeaderPoints = loaderData.leaders[0]?.points ?? 1;

  const statCards = [
    {
      label: "Total points",
      value: stats.totalPoints,
      icon: Trophy,
      accent: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Exact hits",
      value: stats.exact,
      icon: Crosshair,
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Result hits",
      value: stats.result,
      icon: Target,
      accent: "text-sky-600 dark:text-sky-400",
    },
    {
      label: "Hit rate",
      value: stats.settled ? `${stats.accuracy}%` : "—",
      icon: TrendingUp,
      accent: "text-violet-600 dark:text-violet-400",
    },
  ];

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Your predictions, trends, and where you stand in the pool.
          </p>
        </div>
        {stats.rank ? (
          <Badge variant="secondary" className="gap-1 px-3 py-1 text-sm">
            <Zap className="size-3.5" />
            Rank #{stats.rank} of {stats.playerCount}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map(({ label, value, icon: Icon, accent }) => (
            <div
              key={label}
              className="rounded-2xl border bg-card p-5 text-card-foreground"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm">{label}</p>
                <Icon className={`size-4 ${accent}`} />
              </div>
              <p className="mt-3 font-semibold text-4xl tabular-nums">
                {value}
              </p>
            </div>
          ))}
        </div>

        <SpotlightCard spotlight={loaderData.spotlight} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5 text-card-foreground">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-lg tracking-tight">
                Points trend
              </h2>
              <p className="text-muted-foreground text-sm">
                Cumulative score across settled matches
              </p>
            </div>
            <Badge variant="outline">{stats.settled} settled</Badge>
          </div>
          <div className="mt-4">
            <PointsTrendChart data={loaderData.trend} />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 text-card-foreground">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-lg tracking-tight">
                Your prediction mix
              </h2>
              <p className="text-muted-foreground text-sm">
                Exact scores vs results vs misses
              </p>
            </div>
            <Badge variant="outline">{loaderData.bets} bets placed</Badge>
          </div>
          <div className="mt-4">
            <PredictionBreakdownChart
              data={{
                exact: stats.exact,
                result: stats.result,
                miss: stats.miss,
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border bg-card p-5 text-card-foreground">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg tracking-tight">
                Leaderboard pulse
              </h2>
              <p className="text-muted-foreground text-sm">Top 5 right now</p>
            </div>
            <Badge>Top 5</Badge>
          </div>
          <div className="mt-5 grid gap-3">
            {loaderData.leaders.some((leader) => leader.totalBets > 0) ? (
              loaderData.leaders.map((leader, index) => {
                const width = Math.max(
                  8,
                  Math.round((leader.points / maxLeaderPoints) * 100),
                );

                return (
                  <div
                    key={leader.userId}
                    className="rounded-xl bg-muted/40 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-6 tabular-nums text-muted-foreground">
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
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <p className="mt-2 text-muted-foreground text-xs tabular-nums">
                      {leader.exactScores} exact · {leader.resultHits} result
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground">
                Place bets and settle matches to start the leaderboard.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl border bg-card p-5 text-card-foreground">
            <div className="mb-4">
              <h2 className="font-semibold text-lg tracking-tight">
                Pool trends
              </h2>
              <p className="text-muted-foreground text-sm">
                How the whole office is predicting
              </p>
            </div>
            <PoolTrendChart data={loaderData.poolBreakdown} />
          </div>

          <div className="rounded-2xl border bg-card p-5 text-card-foreground">
            <h2 className="font-semibold text-lg tracking-tight">
              Recent picks
            </h2>
            <div className="mt-4 grid gap-2">
              {loaderData.recentScores.length ? (
                loaderData.recentScores.map((score) => (
                  <div
                    key={`${score.kickoffAt}-${score.homeTeam}-${score.awayTeam}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {score.homeTeam} vs {score.awayTeam}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {dateFormatter.format(new Date(score.kickoffAt))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={reasonBadgeVariant(score.reason)}>
                        {reasonLabels[score.reason]}
                      </Badge>
                      <span className="font-semibold text-sm tabular-nums">
                        +{score.points}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">
                  Your last settled predictions will show up here.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Tournament matches", loaderData.matches],
          ["Your open bets", loaderData.bets],
          ["Misses", stats.miss],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border bg-muted/20 px-5 py-4 text-card-foreground"
          >
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="mt-1 font-semibold text-2xl tabular-nums">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
