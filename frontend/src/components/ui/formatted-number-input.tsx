import * as React from "react";

import { Input } from "@/components/ui/input";
import { formatNumberFromDigits, sanitizeNumberInput } from "@/lib/utils";

type FormattedNumberInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "onChange"
> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
};

function countDigits(text: string): number {
  return (text.match(/\d/g) ?? []).length;
}

function caretForDigitIndex(formatted: string, digitIndex: number): number {
  if (digitIndex <= 0) return 0;
  let digitsSeen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) {
      digitsSeen += 1;
      if (digitsSeen >= digitIndex) return i + 1;
    }
  }
  return formatted.length;
}

export const FormattedNumberInput = React.forwardRef<
  HTMLInputElement,
  FormattedNumberInputProps
>(({ value, onValueChange, ...props }, ref) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  const [displayValue, setDisplayValue] = React.useState(() =>
    value == null ? "" : formatNumberFromDigits(String(value)),
  );

  React.useEffect(() => {
    const next = value == null ? "" : formatNumberFromDigits(String(value));
    setDisplayValue((prev) => (prev === next ? prev : next));
  }, [value]);

  return (
    <Input
      {...props}
      inputMode="numeric"
      value={displayValue}
      ref={inputRef}
      onChange={(event) => {
        const rawValue = event.target.value;
        const selectionStart = event.target.selectionStart ?? rawValue.length;
        const digitsBeforeCaret = countDigits(rawValue.slice(0, selectionStart));
        const digits = sanitizeNumberInput(rawValue);
        const formatted = formatNumberFromDigits(digits);

        setDisplayValue(formatted);
        onValueChange(digits ? Number.parseInt(digits, 10) : null);

        const nextCaret = caretForDigitIndex(formatted, digitsBeforeCaret);
        requestAnimationFrame(() => {
          inputRef.current?.setSelectionRange(nextCaret, nextCaret);
        });
      }}
    />
  );
});

FormattedNumberInput.displayName = "FormattedNumberInput";
