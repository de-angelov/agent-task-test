import { redirect, useActionData, useLoaderData } from "react-router";

import { db } from "~/db/client.server";
import { createLoginSession } from "~/services/auth.server";
import { createSessionCookie } from "~/services/session.server";

import {
  PlaceholderForm,
  PlaceholderNotice,
  PublicScreenShell,
} from "./placeholder-ui";

type ActionArgs = {
  request: Request;
};

type LoaderArgs = {
  request: Request;
};

export function meta() {
  return [{ title: "Log In" }];
}

export async function loader({ request }: LoaderArgs) {
  const url = new URL(request.url);

  return {
    verified: url.searchParams.get("verified") === "1",
  };
}

export async function action({ request }: ActionArgs) {
  const formData = await request.formData();
  const result = await createLoginSession(
    {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    },
    { db },
  );

  if (result.isErr()) {
    return { status: "error", error: result.error };
  }

  return redirect("/board", {
    headers: {
      "Set-Cookie": await createSessionCookie(result.value.sessionId),
    },
  });
}

export function LoginView({
  actionData,
  verified = false,
}: {
  actionData?: Exclude<Awaited<ReturnType<typeof action>>, Response>;
  verified?: boolean;
}) {
  return (
    <PublicScreenShell title="Log in">
      {verified ? (
        <PlaceholderNotice>Email verified. You can now log in.</PlaceholderNotice>
      ) : null}
      <PlaceholderNotice>
        Use your verified local account. Unverified accounts can request a new
        verification email below.
      </PlaceholderNotice>
      {actionData?.status === "error" ? (
        <PlaceholderNotice>{actionData.error}</PlaceholderNotice>
      ) : null}
      <PlaceholderForm
        actionLabel="Log in"
        fields={[
          { label: "Email address", name: "email", type: "email" },
          { label: "Password", name: "password", type: "password" },
        ]}
        title="Use local credentials"
      />
      <form action="/resend-verification" className="inline-form" method="post">
        <label className="form-field">
          <span>Email address</span>
          <input name="email" type="email" />
        </label>
        <button type="submit">Resend verification email</button>
      </form>
    </PublicScreenShell>
  );
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const data = useLoaderData<typeof loader>();

  return <LoginView actionData={actionData} verified={data.verified} />;
}
