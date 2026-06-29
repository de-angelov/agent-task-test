import { redirect, useActionData, useLoaderData } from "react-router";

import { db } from "~/db/client.server";
import { createLoginSession } from "~/services/auth/auth.server";
import { createSessionCookie } from "~/services/session/session.server";

import {
  AuthField,
  AuthForm,
  AuthNotice,
  AuthPanel,
} from "./auth-ui";

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
    <AuthPanel
      footer={
        <>
          <a href="/signup">Create an account</a>
          <a href="/resend-verification">Resend verification email</a>
        </>
      }
      title="Log in"
    >
      {verified ? (
        <AuthNotice tone="success">
          Email verified. You can now log in.
        </AuthNotice>
      ) : null}
      <AuthNotice>
        Use your verified local account. Unverified accounts can request a new
        verification email.
      </AuthNotice>
      {actionData?.status === "error" ? (
        <AuthNotice tone="error">{actionData.error}</AuthNotice>
      ) : null}
      <AuthForm actionLabel="Log in" title="Use local credentials">
        <AuthField label="Email address" name="email" type="email" />
        <AuthField label="Password" name="password" type="password" />
      </AuthForm>
    </AuthPanel>
  );
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const data = useLoaderData<typeof loader>();

  return <LoginView actionData={actionData} verified={data.verified} />;
}
