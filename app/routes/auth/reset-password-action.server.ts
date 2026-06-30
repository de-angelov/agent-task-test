import { redirect } from "react-router";

import {
  resetPasswordWithToken,
  validatePasswordResetToken,
  type PasswordResetTokenValidationError,
  type ResetPasswordError,
} from "~/services/password-reset/password-reset.server";

export type ResetPasswordStatus =
  | "ready"
  | PasswordResetTokenValidationError
  | "password-too-short";

export type ResetPasswordLoaderData = {
  status: Exclude<ResetPasswordStatus, "password-too-short">;
  token: string;
};

export type ResetPasswordActionData = {
  status: ResetPasswordError;
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
