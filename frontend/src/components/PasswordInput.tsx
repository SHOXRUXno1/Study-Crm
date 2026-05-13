import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password input with a built-in show/hide toggle (eye icon).
 *
 * Behaviour:
 * - Default rendered as `type="password"`. Clicking the eye reveals the value
 *   (`type="text"`).
 * - Reveal state is local to the component instance — values are never logged
 *   or exposed via props.
 * - Toggle button is hidden while the field is empty or disabled, so the
 *   placeholder area stays clean.
 * - Forwards every other prop (and ref) to the underlying `<input>`.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, value, defaultValue, disabled, ...props }, ref) => {
  const [revealed, setRevealed] = React.useState(false);

  const isEmpty =
    (value === undefined ? defaultValue : value) === undefined ||
    String(value ?? defaultValue ?? "").length === 0;

  const showToggle = !disabled && !isEmpty;

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={revealed ? "text" : "password"}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        className={cn(showToggle ? "pr-10" : undefined, className)}
        {...props}
      />
      {showToggle && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={revealed ? "Hide password" : "Show password"}
          onClick={() => setRevealed((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
