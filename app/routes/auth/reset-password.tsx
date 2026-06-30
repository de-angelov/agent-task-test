import { useActionData, useLoaderData } from "react-router";
import { match } from "ts-pattern";

import { db } from "~/db/client.server";
import {
  resetPasswordWithToken,
  validatePasswordResetToken,
} from "~/services/password-reset/password-reset.server";

import {
  handleResetPasswordAction,
  handleResetPasswordLoader,
  type ResetPasswordStatus,
} from "./reset-password-action.server";
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
  return [{ title: "Reset Password" }];
}

export function loader({ request }: LoaderArgs) {
  return handleResetPasswordLoader(request, {
    validatePasswordResetToken,
    db,
  });
}

export async function action({ request }: ActionArgs) {
  return handleResetPasswordAction(request, {
    resetPasswordWithToken,
    db,
  });
}

export function ResetPasswordView({
  status,
  token,
}: {
  status?: ResetPasswordStatus;
  token?: string;
}) {
  const currentStatus = status ?? "invalid-token";
  const currentToken = token ?? "";
  const message = formatResetPasswordStatus(currentStatus);
  const canReset =
    currentStatus === "ready" || currentStatus === "password-too-short";

  return (
    <AuthPanel
      footer={
        <>
          <a href="/forgot-password">Request a new reset link</a>
          <a href="/login">Return to log in</a>
        </>
      }
      title="Reset password"
    >
      {message !== undefined ? (
        <AuthNotice tone="error">{message}</AuthNotice>
      ) : (
        <AuthNotice>Choose a new password for your account.</AuthNotice>
      )}
      {canReset ? (
        <AuthForm actionLabel="Set new password" title="New password">
          <input name="token" type="hidden" value={currentToken} readOnly />
          <AuthField label="New password" name="password" type="password" />
        </AuthForm>
      ) : null}
    </AuthPanel>
  );
}

export default function ResetPassword() {
  const actionData = useActionData<typeof action>();
  const loaderData = useLoaderData<typeof loader>();

  if (actionData !== undefined) {
    return (
      <ResetPasswordView
        status={actionData.status}
        token={actionData.token}
      />
    );
  }

  return (
    <ResetPasswordView
      status={loaderData.status}
      token={loaderData.token}
    />
  );
}

function formatResetPasswordStatus(
  status: ResetPasswordStatus,
): string | undefined {
  return match(status)
    .with("ready", () => undefined)
    .with("invalid-token", () => "The password reset link is invalid.")
    .with("expired-token", () => "The password reset link has expired.")
    .with(
      "token-already-used",
      () => "The password reset link was already used.",
    )
    .with("password-too-short", () => "Password must be at least 8 characters.")
    .exhaustive();
}
