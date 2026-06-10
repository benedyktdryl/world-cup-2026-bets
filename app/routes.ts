import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/auth.login.tsx"),
  route("invite/:token", "routes/invite.$token.tsx"),
  route("api/auth/*", "routes/api.auth.$.ts"),
  route("api/cron/crawl", "routes/api.cron.crawl.ts"),
  route("api/setup/admin", "routes/api.setup.admin.ts"),
  route("app", "routes/app.tsx", [
    index("routes/app.dashboard.tsx"),
    route("matches", "routes/app.matches.tsx"),
    route("groups", "routes/app.groups.tsx"),
    route("bracket", "routes/app.bracket.tsx"),
    route("leaderboard", "routes/app.leaderboard.tsx"),
    route("admin", "routes/admin.tsx", [
      route("invites", "routes/admin.invites.tsx"),
      route("users", "routes/admin.users.tsx"),
      route("crawl", "routes/admin.crawl.tsx"),
    ]),
  ]),
  route("admin/*", "routes/admin.redirect.$.tsx"),
] satisfies RouteConfig;
