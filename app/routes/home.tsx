import { redirect, useActionData } from "react-router";
import { SignInForm } from "~/components/sign-in-form";
import { contestRulesSummary } from "~/lib/contest-rules";
import { signInFromForm } from "~/lib/server/auth-actions";
import { getCurrentSession } from "~/lib/server/session";
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

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);
  if (session) {
    throw redirect("/app");
  }

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  return signInFromForm(await request.formData());
}

export default function Home() {
  const actionData = useActionData<typeof action>();

  return (
    <main id="main-content" className="min-h-svh overflow-hidden hero-glow">
      <section className="relative flex min-h-svh items-center px-6 py-10 sm:px-10">
        <div className="absolute inset-0 pitch-grid opacity-25" />
        <div className="absolute top-20 right-[-8rem] size-80 rounded-full bg-primary/20 blur-3xl animate-drift" />

        <div className="relative z-10 grid w-full gap-10 lg:grid-cols-2 lg:items-start lg:gap-12">
          <div className="flex flex-col gap-8">
            <div className="animate-rise flex flex-col gap-4">
              <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.35em]">
                World Cup 2026
              </p>
              <h1 className="text-balance font-semibold text-5xl tracking-tight sm:text-6xl lg:text-7xl">
                World Cup Bets
              </h1>
              <p className="max-w-xl text-muted-foreground text-pretty text-lg sm:text-xl">
                Predict every match, chase exact scores, and turn the office
                World Cup chat into a live leaderboard.
              </p>
            </div>

            <section
              aria-labelledby="contest-rules-heading"
              className="animate-rise-delay rounded-2xl border bg-card/90 p-6 text-card-foreground shadow-sm backdrop-blur-sm"
            >
              <h2
                id="contest-rules-heading"
                className="mb-4 font-semibold text-2xl tracking-tight"
              >
                Contest rules
              </h2>
              <ol className="list-decimal space-y-2 pl-5 text-muted-foreground text-sm">
                {contestRulesSummary.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ol>
            </section>
          </div>

          <div
            id="sign-in"
            className="animate-rise-delay rounded-2xl border bg-card p-6 text-card-foreground shadow-sm lg:sticky lg:top-10"
          >
            <div className="mb-6 flex flex-col gap-2">
              <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.25em]">
                Sign in
              </p>
              <h2 className="font-semibold text-3xl tracking-tight">
                Join the pool
              </h2>
              <p className="text-muted-foreground text-sm">
                Log in with the account you created from your invite link.
              </p>
            </div>

            <SignInForm actionData={actionData} />
          </div>
        </div>
      </section>
    </main>
  );
}
