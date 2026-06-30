import { useActionData } from "react-router";
import { match } from "ts-pattern";

import { db } from "~/db/client.server";
import { createSmtpEmailSender, getAppBaseUrl } from "~/services/email/email.server";
import {
  requestPasswordReset,
  type RequestPasswordResetError,
} from "~/services/password-reset/password-reset.server";

import {
  AuthField,
  AuthForm,
  AuthNotice,
  AuthPanel,
} from "./auth-ui";

type ActionArgs = {
  request: Request;
};

type ForgotPasswordActionData =
  | { status: "reset-requested" }
  | { status: "error"; error: RequestPasswordResetError };

type ForgotPasswordActionDependencies = {
  requestPasswordReset: typeof requestPasswordReset;
  db: Parameters<typeof requestPasswordReset>[1]["db"];
  emailSender: Parameters<typeof requestPasswordReset>[1]["emailSender"];
  appBaseUrl: string;
};

export function meta() {
  return [{ title: "Forgot Password" }];
}

export async function handleForgotPasswordAction(
  request: Request,
  dependencies: ForgotPasswordActionDependencies,
): Promise<ForgotPasswordActionData> {
  const formData = await request.formData();
  const result = await dependencies.requestPasswordReset(
    { email: String(formData.get("email") ?? "") },
    {
      db: dependencies.db,
      emailSender: dependencies.emailSender,
      appBaseUrl: dependencies.appBaseUrl,
    },
  );

  if (result.isErr()) {
    return { status: "error", error: result.error };
  }

  return { status: "reset-requested" };
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
