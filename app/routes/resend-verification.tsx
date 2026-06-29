import { redirect, useActionData } from "react-router";

import { db } from "~/db/client.server";
import { resendVerificationEmail } from "~/services/auth.server";
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
  return [{ title: "Resend Verification Email" }];
}

export async function action({ request }: ActionArgs) {
  const formData = await request.formData();
  const result = await resendVerificationEmail(
    { email: String(formData.get("email") ?? "") },
    {
      db,
      emailSender: createSmtpEmailSender(),
      appBaseUrl: getAppBaseUrl(),
    },
  );

  if (result.isErr()) {
    return { status: "error", error: result.error };
  }

  return redirect("/login");
}

export function ResendVerificationView({
  actionData,
}: {
  actionData?: Exclude<Awaited<ReturnType<typeof action>>, Response>;
}) {
  return (
    <AuthPanel
      footer={
        <>
          <a href="/login">Return to log in</a>
          <a href="/signup">Create an account</a>
        </>
      }
      title="Resend verification email"
    >
      <AuthNotice>
        Enter the email address for your unverified account to receive a new
        verification link.
      </AuthNotice>
      {actionData?.status === "error" ? (
        <AuthNotice tone="error">{actionData.error}</AuthNotice>
      ) : null}
      <AuthForm actionLabel="Send verification email" title="Unverified account">
        <AuthField label="Email address" name="email" type="email" />
      </AuthForm>
    </AuthPanel>
  );
}

export default function ResendVerification() {
  const actionData = useActionData<typeof action>();

  return <ResendVerificationView actionData={actionData} />;
}
