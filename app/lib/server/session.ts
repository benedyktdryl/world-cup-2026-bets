import { redirect } from "react-router";
import { type AuthSession, auth } from "./auth";

export async function getCurrentSession(request: Request) {
  return auth.api.getSession({
    headers: request.headers,
  });
}

export async function requireSession(request: Request): Promise<AuthSession> {
  const session = await getCurrentSession(request);
  if (!session) {
    throw redirect("/");
  }

  return session;
}
