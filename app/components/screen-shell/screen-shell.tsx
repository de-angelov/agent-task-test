import type { ReactNode } from "react";

import { AuthenticatedHeader } from "~/components/authenticated-header";

type ScreenShellProps = {
  title: string;
  children: ReactNode;
  userEmail?: string;
};

export function ScreenShell({
  title,
  children,
  userEmail = "user@example.com",
}: ScreenShellProps) {
  return (
    <main className="page">
      <AuthenticatedHeader userEmail={userEmail} />
      <h1>{title}</h1>
      {children}
    </main>
  );
}
