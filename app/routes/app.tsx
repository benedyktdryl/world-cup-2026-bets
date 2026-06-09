import { Outlet } from "react-router";
import { AppSidebar } from "~/components/app-sidebar";
import { Separator } from "~/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
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
  return (
    <SidebarProvider>
      <AppSidebar userName={loaderData.user.name} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <div className="flex flex-col">
            <span className="font-medium text-sm">World Cup 2026</span>
            <span className="text-muted-foreground text-xs">
              Office betting contest
            </span>
          </div>
        </header>
        <div
          id="main-content"
          className="flex flex-1 flex-col gap-6 p-4 md:p-6"
        >
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
