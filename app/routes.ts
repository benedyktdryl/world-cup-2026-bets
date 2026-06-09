import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/auth.login.tsx"),
  route("invite/:token", "routes/invite.$token.tsx"),
  route("api/auth/*", "routes/api.auth.$.ts"),
  route("app", "routes/app.tsx", [
    index("routes/app.dashboard.tsx"),
    route("matches", "routes/app.matches.tsx"),
    route("groups", "routes/app.groups.tsx"),
    route("bracket", "routes/app.bracket.tsx"),
    route("leaderboard", "routes/app.leaderboard.tsx"),
  ]),
  route("admin", "routes/admin.tsx", [
    route("invites", "routes/admin.invites.tsx"),
    route("crawl", "routes/admin.crawl.tsx"),
  ]),
] satisfies RouteConfig;
