import { Form, useActionData } from "react-router";
import { Button } from "~/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { requireAdmin } from "~/lib/server/admin";
import { crawlFlashscoreCompetition } from "~/lib/server/crawl/flashscore";
import { withDatabase } from "~/lib/server/db";
import type { Route } from "./+types/admin.crawl";

type ActionResult = {
  result?: {
    teams: number;
    matches: number;
    jobStatus: "SUCCEEDED";
  };
  error?: string;
};

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const competitionName = String(formData.get("competitionName") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();
  const baseUrl = String(formData.get("baseUrl") ?? "").trim();

  if (!competitionName || !sourceUrl || !baseUrl) {
    return {
      error: "Competition name, source URL, and base URL are required.",
    };
  }

  try {
    const result = await withDatabase((db) =>
      crawlFlashscoreCompetition(db, {
        competitionName,
        sourceUrl,
        baseUrl,
      }),
    );
    return { result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Crawl failed.",
    };
  }
}

export default function AdminCrawl() {
  const actionData = useActionData<ActionResult>();

  return (
    <section className="flex max-w-xl flex-col gap-6 rounded-2xl border bg-card p-6 text-card-foreground">
      <div>
        <h2 className="font-semibold text-2xl tracking-tight">
          Crawl Flashscore
        </h2>
        <p className="text-muted-foreground text-sm">
          Pull fixtures and finished scores from a Flashscore competition page.
        </p>
      </div>
      <Form method="post" className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="competitionName">Competition Name</FieldLabel>
            <Input
              id="competitionName"
              name="competitionName"
              defaultValue="World Cup 2026"
              autoComplete="off"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="sourceUrl">Flashscore Source URL</FieldLabel>
            <Input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              inputMode="url"
              defaultValue="https://www.flashscore.com/football/world/world-championship/"
              placeholder="https://www.flashscore.com/football/world/world-championship/"
              autoComplete="off"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="baseUrl">Flashscore Base URL</FieldLabel>
            <Input
              id="baseUrl"
              name="baseUrl"
              type="url"
              inputMode="url"
              defaultValue="https://www.flashscore.com"
              autoComplete="off"
              required
            />
            <FieldDescription>
              Requests are cached and paced; the crawler does not bypass CAPTCHA
              or paywalls.
            </FieldDescription>
          </Field>
        </FieldGroup>
        {actionData?.error ? (
          <p aria-live="polite" className="text-destructive text-sm">
            {actionData.error}
          </p>
        ) : null}
        {actionData?.result ? (
          <p aria-live="polite" className="text-sm">
            Crawled {actionData.result.matches} matches and{" "}
            {actionData.result.teams} teams.
          </p>
        ) : null}
        <Button type="submit">Start Crawl</Button>
      </Form>
    </section>
  );
}
