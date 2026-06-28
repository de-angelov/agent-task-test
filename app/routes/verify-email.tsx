import { match } from "ts-pattern";
import { useLoaderData } from "react-router";

import { PlaceholderNotice, ScreenShell } from "./placeholder-ui";

type VerificationStatus = "success" | "invalid-token" | "expired-token";

type LoaderArgs = {
  request: Request;
};

export function meta() {
  return [{ title: "Email Verification" }];
}

function normalizeVerificationStatus(value: string | null): VerificationStatus {
  return match(value)
    .with("success", () => "success" as const)
    .with("expired-token", () => "expired-token" as const)
    .otherwise(() => "invalid-token" as const);
}

export async function loader({ request }: LoaderArgs) {
  const url = new URL(request.url);

  return {
    status: normalizeVerificationStatus(url.searchParams.get("status")),
  };
}

export function VerifyEmailView({
  status = "success",
}: {
  status?: VerificationStatus;
}) {
  const message = match(status)
    .with("success", () => "Email verified. You can now log in.")
    .with("invalid-token", () => "The verification link is invalid.")
    .with("expired-token", () => "The verification link has expired.")
    .exhaustive();

  return (
    <ScreenShell title="Email verification">
      <PlaceholderNotice>{message}</PlaceholderNotice>
      {status !== "success" ? (
        <form action="/resend-verification" className="inline-form" method="post">
          <label className="form-field">
            <span>Email address</span>
            <input name="email" type="email" />
          </label>
          <button type="submit">Send a new verification email</button>
        </form>
      ) : null}
    </ScreenShell>
  );
}

export default function VerifyEmail() {
  const data = useLoaderData<typeof loader>();

  return <VerifyEmailView status={data.status} />;
}
