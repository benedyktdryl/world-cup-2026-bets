import { Link, NavLink, Outlet } from "react-router";
import { Button } from "~/components/ui/button";
import { requireSession } from "~/lib/server/session";
import type { Route } from "./+types/app";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireSession(request);
  return {
    user: {
      name: session.user.name,
      email: session.user.email,
    },
  };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const navItems = [
    ["Dashboard", "/app"],
    ["Matches", "/app/matches"],
    ["Groups", "/app/groups"],
    ["Bracket", "/app/bracket"],
    ["Leaderboard", "/app/leaderboard"],
  ];

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-8 px-6 py-8"
    >
      <header className="sticky top-0 z-20 -mx-6 flex flex-col gap-4 border-b bg-background/90 px-6 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/app" className="flex flex-col gap-1">
            <span className="font-semibold text-2xl tracking-tight">
              World Cup Bets
            </span>
            <span className="text-muted-foreground text-sm">
              Signed in as {loaderData.user.name}
            </span>
          </Link>
          <Button asChild variant="outline">
            <Link to="/admin/invites">Admin</Link>
          </Button>
        </div>
        <nav className="flex gap-2 overflow-x-auto" aria-label="App navigation">
          {navItems.map(([label, href]) => (
            <Button key={href} asChild variant="ghost" size="sm">
              <NavLink
                to={href}
                end={href === "/app"}
                className={({ isActive }) =>
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground"
                }
              >
                {label}
              </NavLink>
            </Button>
          ))}
        </nav>
      </header>
      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.25em]">
            Contest Hub
          </p>
          <h1 className="text-balance font-semibold text-4xl tracking-tight">
            Follow every prediction from groups to the final.
          </h1>
        </div>
        <Outlet />
      </section>
    </main>
  );
}
