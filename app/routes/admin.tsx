import { Link, Outlet } from "react-router";
import { Button } from "~/components/ui/button";
import { requireAdmin } from "~/lib/server/admin";
import type { Route } from "./+types/admin";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

export default function AdminLayout() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 px-6 py-8"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Admin</p>
          <h1 className="font-semibold text-3xl tracking-tight">
            Contest Operations
          </h1>
        </div>
        <nav className="flex gap-2" aria-label="Admin navigation">
          <Button asChild variant="outline">
            <Link to="/admin/invites">Invites</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/crawl">Crawl</Link>
          </Button>
        </nav>
      </header>
      <Outlet />
    </main>
  );
}
