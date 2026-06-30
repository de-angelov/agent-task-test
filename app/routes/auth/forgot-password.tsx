import { useActionData } from "react-router";
import { match } from "ts-pattern";

import { db } from "~/db/client.server";
import { createSmtpEmailSender, getAppBaseUrl } from "~/services/email/email.server";
import {
  requestPasswordReset,
  type RequestPasswordResetError,
} from "~/services/password-reset/password-reset.server";

import {
  handleForgotPasswordAction,
  type ForgotPasswordActionData,
} from "./forgot-password-action.server";
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
  return [{ title: "Forgot Password" }];
}

export async function action({
  request,
}: ActionArgs): Promise<ForgotPasswordActionData> {
  return handleForgotPasswordAction(request, {
    requestPasswordReset,
    db,
    emailSender: createSmtpEmailSender(),
    appBaseUrl: getAppBaseUrl(),
  });
}

export function ForgotPasswordView({
  actionData,
}: {
  actionData?: ForgotPasswordActionData;
}) {
  return (
    <AuthPanel
      footer={
        <>
          <a href="/login">Return to log in</a>
          <a href="/signup">Create an account</a>
        </>
      }
      title="Forgot password"
    >
      <AuthNotice>
        Enter your email address and we will send password reset instructions if
        an account exists.
      </AuthNotice>
      {actionData?.status === "reset-requested" ? (
        <AuthNotice tone="success">
          If an account exists for that email address, password reset
          instructions have been sent.
        </AuthNotice>
      ) : null}
      {actionData?.status === "error" ? (
        <AuthNotice tone="error">
          {formatRequestPasswordResetError(actionData.error)}
        </AuthNotice>
      ) : null}
      <AuthForm actionLabel="Send reset instructions" title="Reset password">
        <AuthField label="Email address" name="email" type="email" />
      </AuthForm>
    </AuthPanel>
  );
}

export default function ForgotPassword() {
  const actionData = useActionData<typeof action>();

  return <ForgotPasswordView actionData={actionData} />;
}

function formatRequestPasswordResetError(
  error: RequestPasswordResetError,
): string {
  return match(error)
    .with("invalid-email", () => "Enter a valid email address.")
    .with(
      "email-delivery-failed",
      () => "We could not send a password reset email. Try again later.",
    )
    .exhaustive();
}
