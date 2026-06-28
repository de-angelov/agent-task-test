import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "destructive";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingLabel?: string;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className,
  disabled = false,
  isLoading = false,
  loadingLabel = "Loading...",
  type = "button",
  variant = "primary",
  ...buttonProps
}: ButtonProps) {
  const buttonClassName = [
    "button",
    `button-${variant}`,
    isLoading ? "button-loading" : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...buttonProps}
      aria-busy={isLoading || undefined}
      className={buttonClassName}
      disabled={disabled || isLoading}
      type={type}
    >
      {isLoading ? loadingLabel : children}
    </button>
  );
}

export type { ButtonProps, ButtonVariant };
