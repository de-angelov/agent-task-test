import type { ReactNode } from "react";

type Field = {
  label: string;
  name: string;
  type?: string;
  value?: string;
};

type ShellProps = {
  title: string;
  children: ReactNode;
};

type PlaceholderFormProps = {
  title: string;
  fields: Field[];
  actionLabel: string;
  children?: ReactNode;
};

export function ScreenShell({ title, children }: ShellProps) {
  return (
    <main className="page">
      <nav className="top-links" aria-label="Primary">
        <a href="/signup">Sign up</a>
        <a href="/login">Log in</a>
        <a href="/board">Board</a>
        <a href="/teams">Teams</a>
        <a href="/epics">Epics</a>
      </nav>
      <h1>{title}</h1>
      {children}
    </main>
  );
}

export function PlaceholderForm({
  title,
  fields,
  actionLabel,
  children,
}: PlaceholderFormProps) {
  return (
    <form className="form-panel" method="post">
      <h2>{title}</h2>
      {fields.map((field) => (
        <label className="form-field" key={field.name}>
          <span>{field.label}</span>
          <input
            defaultValue={field.value}
            name={field.name}
            type={field.type ?? "text"}
          />
        </label>
      ))}
      {children}
      <button type="submit">{actionLabel}</button>
    </form>
  );
}

export function PlaceholderNotice({ children }: { children: ReactNode }) {
  return <p className="placeholder-notice">{children}</p>;
}
