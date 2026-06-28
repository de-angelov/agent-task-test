import { redirect } from "react-router";

import { db } from "~/db/client.server";
import { resendVerificationEmail } from "~/services/auth.server";
import { createSmtpEmailSender, getAppBaseUrl } from "~/services/email.server";

type ActionArgs = {
  request: Request;
};

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
