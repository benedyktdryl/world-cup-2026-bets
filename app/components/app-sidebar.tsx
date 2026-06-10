import {
  GitBranch,
  Grid3x3,
  LayoutDashboard,
  LogOut,
  Medal,
  Radar,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import { Form, NavLink } from "react-router";
import { Button } from "~/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";

const navItems = [
  {
    title: "Dashboard",
    url: "/app",
    icon: LayoutDashboard,
    end: true,
  },
  {
    title: "Matches",
    url: "/app/matches",
    icon: Trophy,
  },
  {
    title: "Groups",
    url: "/app/groups",
    icon: Grid3x3,
  },
  {
    title: "Bracket",
    url: "/app/bracket",
    icon: GitBranch,
  },
  {
    title: "Leaderboard",
    url: "/app/leaderboard",
    icon: Medal,
  },
] as const;

const adminItems = [
  {
    title: "Invites",
    url: "/app/admin/invites",
    icon: Shield,
  },
  {
    title: "Users",
    url: "/app/admin/users",
    icon: Users,
  },
  {
    title: "Crawl",
    url: "/app/admin/crawl",
    icon: Radar,
  },
] as const;

export function AppSidebar({ userName }: { userName: string }) {
  return (
    <Sidebar collapsible="none" variant="inset">
      <SidebarHeader>
        <div className="flex flex-col gap-1 px-2 py-1">
          <span className="font-semibold text-base tracking-tight">
            World Cup Bets
          </span>
          <span className="truncate text-muted-foreground text-sm">
            {userName}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Contest</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={false}>
                    <NavLink
                      to={item.url}
                      end={"end" in item ? item.end : false}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Form method="post" action="/app">
          <input type="hidden" name="intent" value="logout" />
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start gap-2"
          >
            <LogOut className="size-4" />
            Log out
          </Button>
        </Form>
      </SidebarFooter>
    </Sidebar>
  );
}
