import { redirect, useActionData, useLoaderData } from "react-router";
import { match } from "ts-pattern";

import { db } from "~/db/client.server";
import {
  resetPasswordWithToken,
  validatePasswordResetToken,
  type PasswordResetTokenValidationError,
  type ResetPasswordError,
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

type LoaderArgs = {
  request: Request;
};

type ResetPasswordStatus =
  | "ready"
  | PasswordResetTokenValidationError
  | "password-too-short";

type ResetPasswordLoaderData = {
  status: Exclude<ResetPasswordStatus, "password-too-short">;
  token: string;
};

type ResetPasswordActionData = {
  status: ResetPasswordStatus;
  token: string;
};

type ResetPasswordLoaderDependencies = {
  validatePasswordResetToken: typeof validatePasswordResetToken;
  db: Parameters<typeof validatePasswordResetToken>[1]["db"];
};

type ResetPasswordActionDependencies = {
  resetPasswordWithToken: typeof resetPasswordWithToken;
  db: Parameters<typeof resetPasswordWithToken>[1]["db"];
};

export function meta() {
  return [{ title: "Reset Password" }];
}

export function handleResetPasswordLoader(
  request: Request,
  dependencies: ResetPasswordLoaderDependencies,
): ResetPasswordLoaderData {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  if (token.length === 0) {
    return { status: "invalid-token", token };
  }

  const result = dependencies.validatePasswordResetToken(
    { token },
    { db: dependencies.db },
  );

  if (result.isErr()) {
    return { status: result.error, token };
  }

  return { status: "ready", token };
}

export async function handleResetPasswordAction(
  request: Request,
  dependencies: ResetPasswordActionDependencies,
): Promise<ResetPasswordActionData | Response> {
  const formData = await request.formData();
  const token = String(formData.get("token") ?? "");
  const result = await dependencies.resetPasswordWithToken(
    {
      token,
      password: String(formData.get("password") ?? ""),
    },
    { db: dependencies.db },
  );

  if (result.isOk()) {
    return redirect("/login?passwordReset=1");
  }

  return {
    status: result.error,
    token,
  };
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
  status = "invalid-token",
  token = "",
}: {
  status?: ResetPasswordStatus;
  token?: string;
}) {
  const message = match(status)
    .with("ready", () => undefined)
    .with("password-too-short", () => "Password must be at least 8 characters.")
    .with("invalid-token", () => "The password reset link is invalid.")
    .with("expired-token", () => "The password reset link has expired.")
    .with("token-already-used", () => "The password reset link was already used.")
    .exhaustive();

  const canReset = status === "ready" || status === "password-too-short";

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
        <AuthNotice tone={canReset ? "error" : "error"}>{message}</AuthNotice>
      ) : (
        <AuthNotice>Choose a new password for your account.</AuthNotice>
      )}
      {canReset ? (
        <AuthForm actionLabel="Set new password" title="New password">
          <input name="token" type="hidden" value={token} readOnly />
          <AuthField label="New password" name="password" type="password" />
        </AuthForm>
      ) : null}
    </AuthPanel>
  );
}

export default function ResetPassword() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (actionData !== undefined && !(actionData instanceof Response)) {
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
