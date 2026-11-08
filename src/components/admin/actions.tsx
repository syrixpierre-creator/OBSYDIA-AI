"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { api, withToast } from "@/lib/client-api";

type Method = "POST" | "PATCH" | "DELETE";

/** Button → API call (+ optional confirmation modal) → refresh. */
export function ActionButton({
  path,
  method = "POST",
  body,
  label,
  success = "Done",
  confirm,
  variant = "secondary",
  size = "sm",
  icon,
}: {
  path: string;
  method?: Method;
  body?: unknown;
  label: string;
  success?: string;
  confirm?: { title: string; description?: string; tone?: "primary" | "danger" };
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  icon?: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    const r = await withToast(api(path, method, body), success);
    setLoading(false);
    if (r !== undefined) router.refresh();
  };
  const btn = (
    <Button variant={variant} size={size} loading={loading} onClick={confirm ? undefined : run}>
      {icon}
      {label}
    </Button>
  );
  if (!confirm) return btn;
  return (
    <Confirm title={confirm.title} description={confirm.description} tone={confirm.tone ?? "primary"} confirmLabel={label} onConfirm={run}>
      {btn}
    </Confirm>
  );
}

export type FormField =
  | { name: string; label: string; type?: "text" | "number" | "password" | "datetime-local" | "email"; placeholder?: string; required?: boolean; defaultValue?: string | number; hint?: string; money?: boolean }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; defaultValue?: string; hint?: string }
  | { name: string; label: string; type: "textarea"; placeholder?: string; required?: boolean; defaultValue?: string; hint?: string }
  | { name: string; label: string; type: "checkbox"; defaultValue?: boolean; hint?: string };

/** Dialog with a small form → API call. `money` fields are converted from dollars to cents. */
export function FormDialog({
  trigger,
  title,
  description,
  fields,
  path,
  method = "POST",
  extra,
  success = "Saved",
  submitLabel = "Save",
  intFields = [],
  dateFields = [],
  keepEmpty = [],
  csvMoney,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  fields: FormField[];
  path: string;
  method?: Method;
  extra?: Record<string, unknown>;
  success?: string;
  submitLabel?: string;
  /** select values converted to integers ("" → null) */
  intFields?: string[];
  /** datetime-local values converted to ISO strings */
  dateFields?: string[];
  /** fields sent even when empty (as "") */
  keepEmpty?: string[];
  /** comma-separated dollar list converted to an array of cents */
  csvMoney?: { from: string; to: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)} className="contents">
        {trigger}
      </span>
      <DialogContent title={title} description={description}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const values: Record<string, unknown> = { ...extra };
            for (const f of fields) {
              if (f.type === "checkbox") values[f.name] = fd.get(f.name) === "on";
              else {
                const raw = String(fd.get(f.name) ?? "");
                if (f.type === "number") values[f.name] = raw === "" ? null : "money" in f && f.money ? Math.round(Number(raw) * 100) : Number(raw);
                else if (raw !== "" || ("required" in f && f.required) || keepEmpty.includes(f.name)) values[f.name] = raw;
              }
            }
            for (const k of intFields) values[k] = values[k] ? Number(values[k]) : null;
            for (const k of dateFields) if (values[k]) values[k] = new Date(String(values[k])).toISOString();
            if (csvMoney && typeof values[csvMoney.from] === "string") {
              values[csvMoney.to] = String(values[csvMoney.from])
                .split(",")
                .map((x) => Math.round(Number(x.trim()) * 100))
                .filter((x) => x > 0);
              delete values[csvMoney.from];
            }
            setLoading(true);
            const r = await withToast(api(path, method, values), success);
            setLoading(false);
            if (r !== undefined) {
              setOpen(false);
              router.refresh();
            }
          }}
        >
          {fields.map((f) => (
            <Field key={f.name} label={f.label} hint={f.hint}>
              {f.type === "select" ? (
                <Select name={f.name} defaultValue={f.defaultValue}>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.type === "textarea" ? (
                <Textarea name={f.name} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} />
              ) : f.type === "checkbox" ? (
                <input type="checkbox" name={f.name} defaultChecked={f.defaultValue} className="h-4 w-4 accent-violet-600" />
              ) : (
                <Input name={f.name} type={f.type ?? "text"} step={f.type === "number" ? "any" : undefined} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} />
              )}
            </Field>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Inline switch bound to a PATCH endpoint. */
export function ToggleField({ path, field, checked, label }: { path: string; field: string; checked: boolean; label?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(checked);
  const [busy, setBusy] = useState(false);
  return (
    <Toggle
      checked={value}
      disabled={busy}
      label={label}
      onChange={async (v) => {
        setBusy(true);
        setValue(v);
        const r = await withToast(api(path, "PATCH", { [field]: v }), v ? "Enabled" : "Disabled");
        if (r === undefined) setValue(!v);
        setBusy(false);
        router.refresh();
      }}
    />
  );
}
