import {
  requestPasswordReset,
  type RequestPasswordResetError,
} from "~/services/password-reset/password-reset.server";

export type ForgotPasswordActionData =
  | { status: "reset-requested" }
  | { status: "error"; error: RequestPasswordResetError };

type ForgotPasswordActionDependencies = {
  requestPasswordReset: typeof requestPasswordReset;
  db: Parameters<typeof requestPasswordReset>[1]["db"];
  emailSender: Parameters<typeof requestPasswordReset>[1]["emailSender"];
  appBaseUrl: string;
};

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
