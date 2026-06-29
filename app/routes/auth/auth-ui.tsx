import type { ReactNode } from "react";

import styles from "./auth.module.css";

type AuthPanelProps = {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

type AuthFormProps = {
  title: string;
  children: ReactNode;
  action?: string;
  actionLabel: string;
};

type AuthFieldProps = {
  label: string;
  name: string;
  type?: string;
};

export function AuthPanel({ title, children, footer }: AuthPanelProps) {
  return (
    <main className={styles.screen}>
      <section className={styles.panel} aria-labelledby="auth-title">
        <header className={styles.header}>
          <h1 id="auth-title">{title}</h1>
        </header>
        {children}
        {footer ? <nav className={styles.links}>{footer}</nav> : null}
      </section>
    </main>
  );
}

export function AuthNotice({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "error";
}) {
  return <p className={`${styles.notice} ${styles[tone]}`}>{children}</p>;
}

export function AuthForm({
  title,
  children,
  action,
  actionLabel,
}: AuthFormProps) {
  return (
    <form action={action} className={styles.form} method="post">
      <h2>{title}</h2>
      {children}
      <button type="submit">{actionLabel}</button>
    </form>
  );
}

export function AuthField({ label, name, type = "text" }: AuthFieldProps) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input name={name} type={type} />
    </label>
  );
}
