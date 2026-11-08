"use client";
import * as React from "react";
import { Dialog, DialogContent } from "./dialog";
import { Button } from "./button";

/** Confirmation modal wrapping any trigger element. */
export function Confirm({
  children,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  onConfirm,
}: {
  children: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => Promise<unknown> | unknown;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {React.cloneElement(children, { onClick: () => setOpen(true) })}
      <DialogContent title={title} description={description}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={tone}
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setLoading(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
