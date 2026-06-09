import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "World Cup Bets" },
    {
      name: "description",
      content: "Office World Cup 2026 betting contest.",
    },
  ];
}

export default function Home() {
  return (
    <main id="main-content" className="min-h-svh overflow-hidden hero-glow">
      <section className="relative flex min-h-svh items-center px-6 py-10 sm:px-10">
        <div className="absolute inset-0 pitch-grid opacity-25" />
        <div className="absolute top-20 right-[-8rem] size-80 rounded-full bg-primary/20 blur-3xl animate-drift" />
        <div className="relative z-10 grid w-full items-end gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,0.7fr)]">
          <div className="flex max-w-4xl flex-col gap-8">
            <div className="animate-rise flex flex-col gap-4">
              <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.35em]">
                World Cup 2026
              </p>
              <h1 className="text-balance font-semibold text-6xl tracking-tight sm:text-7xl lg:text-8xl">
                World Cup Bets
              </h1>
              <p className="max-w-2xl text-muted-foreground text-pretty text-xl">
                Predict every match, chase exact scores, and turn the office
                World Cup chat into a live leaderboard.
              </p>
            </div>

            <div className="animate-rise-delay flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/login">Sign In</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/app/admin/invites">Admin Invites</Link>
              </Button>
            </div>
          </div>

          <div className="animate-rise-delay hidden min-h-[32rem] rounded-2xl border bg-card p-6 shadow-sm lg:flex">
            <div className="flex w-full flex-col justify-between rounded-xl border border-primary/15 bg-gradient-to-b from-secondary/80 to-card p-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Final</span>
                <span className="rounded-full bg-primary px-3 py-1 text-primary-foreground">
                  +3 exact
                </span>
              </div>
              <div className="flex flex-col gap-5">
                {[
                  ["Poland", "2"],
                  ["Germany", "1"],
                ].map(([team, goals]) => (
                  <div
                    key={team}
                    className="flex items-center justify-between border-b pb-4 last:border-b-0"
                  >
                    <span className="font-medium text-2xl">{team}</span>
                    <span className="font-semibold text-5xl tabular-nums">
                      {goals}
                    </span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-xl bg-muted/60 p-3">
                  <div className="font-semibold text-2xl">48</div>
                  <div className="text-muted-foreground">Matches</div>
                </div>
                <div className="rounded-xl bg-muted/60 p-3">
                  <div className="font-semibold text-2xl">3</div>
                  <div className="text-muted-foreground">Points</div>
                </div>
                <div className="rounded-xl bg-muted/60 p-3">
                  <div className="font-semibold text-2xl">1st</div>
                  <div className="text-muted-foreground">Rank</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
