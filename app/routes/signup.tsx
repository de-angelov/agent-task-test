import { PlaceholderForm, PlaceholderNotice, ScreenShell } from "./placeholder-ui";

export function meta() {
  return [{ title: "Sign Up" }];
}

export async function action() {
  return { status: "placeholder-signup" };
}

export function SignupView() {
  return (
    <ScreenShell title="Sign up">
      <PlaceholderNotice>
        Account creation will connect to the authentication service later.
      </PlaceholderNotice>
      <PlaceholderForm
        actionLabel="Create account"
        fields={[
          { label: "Email address", name: "email", type: "email" },
          { label: "Password", name: "password", type: "password" },
        ]}
        title="Create an account"
      />
    </ScreenShell>
  );
}

export default function Signup() {
  return <SignupView />;
}
