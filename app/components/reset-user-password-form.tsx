"use client";

import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function ResetUserPasswordForm({
  userId,
  email,
  displayName,
}: {
  userId: string;
  email: string;
  displayName: string;
}) {
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);
  const isSubmitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("userId") === userId;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Reset password
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {displayName} ({email}). Bets, points, and
            profile stay on the same account.
          </DialogDescription>
        </DialogHeader>

        <Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="reset-password" />
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="email" value={email} />

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${userId}-new-password`}>New password</Label>
            <Input
              id={`${userId}-new-password`}
              name="newPassword"
              type="text"
              autoComplete="new-password"
              minLength={8}
              placeholder="Leave empty to generate one"
            />
            <p className="text-muted-foreground text-xs">
              Leave blank to generate a random password. The user must sign in
              again on all devices.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
