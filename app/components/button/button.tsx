import type { ButtonHTMLAttributes } from "react";

import styles from "./button.module.css";

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
    styles.button,
    styles[variant],
    isLoading ? styles.loading : undefined,
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
