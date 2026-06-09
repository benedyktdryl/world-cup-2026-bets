import { redirect } from "react-router";
import type { Route } from "./+types/admin.redirect.$";

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const suffix = url.pathname.replace(/^\/admin\/?/, "");
  const targetPath =
    suffix.length === 0 ? "/app/admin/invites" : `/app/admin/${suffix}`;

  throw redirect(targetPath);
}
