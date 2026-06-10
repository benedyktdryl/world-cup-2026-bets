import { Link, redirect, useActionData } from "react-router";
import { SignInForm } from "~/components/sign-in-form";
import { signInFromForm } from "~/lib/server/auth-actions";
import { getCurrentSession } from "~/lib/server/session";
import type { Route } from "./+types/auth.login";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Sign In | World Cup Bets" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);
  if (session) {
    throw redirect("/app");
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    throw redirect(`/${url.search}#sign-in`);
  }

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  return signInFromForm(await request.formData());
}

export default function Login() {
  const actionData = useActionData<typeof action>();

  return (
    <main
      id="main-content"
      className="flex min-h-svh items-center justify-center px-6"
    >
      <section className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-3xl tracking-tight">Sign In</h1>
          <p className="text-muted-foreground text-sm">
            The main sign-in form lives on the home page.
          </p>
        </div>
        <SignInForm actionData={actionData} idPrefix="login" />
        <Link to="/#sign-in" className="text-center text-sm">
          Back to home
        </Link>
      </section>
    </main>
  );
}
