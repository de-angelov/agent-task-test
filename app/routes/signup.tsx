import { useActionData } from "react-router";

import { db } from "~/db/client.server";
import { createUserAccount } from "~/services/auth.server";
import { createSmtpEmailSender, getAppBaseUrl } from "~/services/email.server";

import {
  AuthField,
  AuthForm,
  AuthNotice,
  AuthPanel,
} from "./auth-ui";

type ActionArgs = {
  request: Request;
};

export function meta() {
  return [{ title: "Sign Up" }];
}

export async function action({ request }: ActionArgs) {
  const formData = await request.formData();
  const result = await createUserAccount(
    {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    },
    {
      db,
      emailSender: createSmtpEmailSender(),
      appBaseUrl: getAppBaseUrl(),
    },
  );

  if (result.isErr()) {
    return { status: "error", error: result.error };
  }

  return { status: "verification-sent", email: result.value.email };
}

export function SignupView({
  actionData,
}: {
  actionData?: Awaited<ReturnType<typeof action>>;
}) {
  return (
    <AuthPanel
      footer={
        <>
          <a href="/login">Log in to an existing account</a>
          <a href="/resend-verification">Resend verification email</a>
        </>
      }
      title="Sign up"
    >
      <AuthNotice>
        Create an account and verify your email address before using the
        application.
      </AuthNotice>
      {actionData?.status === "verification-sent" ? (
        <AuthNotice tone="success">
          Verification email sent to {actionData.email}.
        </AuthNotice>
      ) : null}
      {actionData?.status === "error" ? (
        <AuthNotice tone="error">{actionData.error}</AuthNotice>
      ) : null}
      <AuthForm actionLabel="Create account" title="Create an account">
        <AuthField label="Email address" name="email" type="email" />
        <AuthField label="Password" name="password" type="password" />
      </AuthForm>
    </AuthPanel>
  );
}

export default function Signup() {
  const actionData = useActionData<typeof action>();

  return <SignupView actionData={actionData} />;
}
