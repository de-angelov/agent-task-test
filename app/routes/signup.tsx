import { useActionData } from "react-router";

import { db } from "~/db/client.server";
import { createUserAccount } from "~/services/auth.server";
import { createSmtpEmailSender, getAppBaseUrl } from "~/services/email.server";

import {
  PlaceholderForm,
  PlaceholderNotice,
  PublicScreenShell,
} from "./placeholder-ui";

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
    <PublicScreenShell title="Sign up">
      <PlaceholderNotice>
        Create an account and verify your email address before using the
        application.
      </PlaceholderNotice>
      {actionData?.status === "verification-sent" ? (
        <PlaceholderNotice>
          Verification email sent to {actionData.email}.
        </PlaceholderNotice>
      ) : null}
      {actionData?.status === "error" ? (
        <PlaceholderNotice>{actionData.error}</PlaceholderNotice>
      ) : null}
      <PlaceholderForm
        actionLabel="Create account"
        fields={[
          { label: "Email address", name: "email", type: "email" },
          { label: "Password", name: "password", type: "password" },
        ]}
        title="Create an account"
      />
    </PublicScreenShell>
  );
}

export default function Signup() {
  const actionData = useActionData<typeof action>();

  return <SignupView actionData={actionData} />;
}
