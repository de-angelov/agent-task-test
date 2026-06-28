import { redirect } from "react-router";
import { match } from "ts-pattern";
import { useLoaderData } from "react-router";

import { db } from "~/db/client.server";
import { verifyEmailToken } from "~/services/auth.server";

import { PlaceholderNotice, PublicScreenShell } from "./placeholder-ui";

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
    <PublicScreenShell title="Email verification">
      <PlaceholderNotice>{message}</PlaceholderNotice>
      <form action="/resend-verification" className="inline-form" method="post">
        <label className="form-field">
          <span>Email address</span>
          <input name="email" type="email" />
        </label>
        <button type="submit">Send a new verification email</button>
      </form>
    </PublicScreenShell>
  );
}

export default function VerifyEmail() {
  const data = useLoaderData<typeof loader>();

  return <VerifyEmailView status={data.status} />;
}
