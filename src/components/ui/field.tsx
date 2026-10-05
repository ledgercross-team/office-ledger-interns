import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FieldProps {
  label: ReactNode;
  error?: string | undefined;
  hint?: ReactNode;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
  required?: boolean;
}

/** Label + control + hint + error, wired with aria-describedby / aria-invalid. Errors are announced. */
export function Field({ label, error, hint, className, children, required }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: (children.props.id as string | undefined) ?? id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        required: required ?? children.props.required,
      })
    : children;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={(children.props.id as string | undefined) ?? id} className="text-sm font-medium text-text">
        {label}
        {required && <span className="text-danger-text"> *</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-text", className)} {...props} />;
}
