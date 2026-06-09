import { Link, NavLink, Outlet } from "react-router";
import { Button } from "~/components/ui/button";
import { requireAdmin } from "~/lib/server/admin";
import type { Route } from "./+types/admin";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export default function AdminLayout() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? "bg-muted text-foreground" : "text-muted-foreground";

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]">
            Admin
          </p>
          <h1 className="font-semibold text-3xl tracking-tight">
            Contest Operations
          </h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/app">Back to app</Link>
        </Button>
      </div>
      <nav className="flex gap-2" aria-label="Admin navigation">
        <Button asChild variant="ghost" size="sm">
          <NavLink to="/app/admin/invites" className={tabClass}>
            Invites
          </NavLink>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <NavLink to="/app/admin/crawl" className={tabClass}>
            Crawl
          </NavLink>
        </Button>
      </nav>
      <Outlet />
    </section>
  );
}
