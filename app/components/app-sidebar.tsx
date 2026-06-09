import {
  GitBranch,
  Grid3x3,
  LayoutDashboard,
  Medal,
  Shield,
  Trophy,
} from "lucide-react";
import { Link, NavLink } from "react-router";
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
  SidebarRail,
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

export function AppSidebar({ userName }: { userName: string }) {
  return (
    <Sidebar collapsible="icon" variant="inset">
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
                  <SidebarMenuButton asChild tooltip={item.title}>
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
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Admin">
              <Link to="/admin/invites">
                <Shield />
                <span>Admin</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
