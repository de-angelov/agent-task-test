import { redirect, useLoaderData } from "react-router";
import { match } from "ts-pattern";

import { db } from "~/db/client.server";
import { verifyEmailToken } from "~/services/auth.server";

import { AuthNotice, AuthPanel } from "./auth-ui";

type VerificationStatus = "invalid-token" | "expired-token" | "token-already-used";

type LoaderArgs = {
  request: Request;
};

export function meta() {
  return [{ title: "Email Verification" }];
}

export async function loader({ request }: LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (token === null) {
    return { status: "invalid-token" as const };
  }

  const result = verifyEmailToken(token, { db });
  if (result.isOk()) {
    return redirect("/login?verified=1");
  }

  return {
    status: result.error,
  };
}

export function VerifyEmailView({
  status = "invalid-token",
}: {
  status?: VerificationStatus;
}) {
  const message = match(status)
    .with("invalid-token", () => "The verification link is invalid.")
    .with("expired-token", () => "The verification link has expired.")
    .with("token-already-used", () => "The verification link was already used.")
    .exhaustive();

  return (
    <AuthPanel
      footer={
        <>
          <a href="/resend-verification">Send a new verification email</a>
          <a href="/login">Return to log in</a>
        </>
      }
      title="Email verification"
    >
      <AuthNotice tone="error">{message}</AuthNotice>
    </AuthPanel>
  );
}

export default function VerifyEmail() {
  const data = useLoaderData<typeof loader>();

  return <VerifyEmailView status={data.status} />;
}
