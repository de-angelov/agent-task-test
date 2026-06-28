import { PlaceholderForm, PlaceholderNotice, ScreenShell } from "./placeholder-ui";

export function meta() {
  return [{ title: "Log In" }];
}

export async function action() {
  return { status: "placeholder-login" };
}

export function LoginView() {
  return (
    <ScreenShell title="Log in">
      <PlaceholderNotice>
        Authentication is not connected yet. Unverified accounts can request a
        new verification email below.
      </PlaceholderNotice>
      <PlaceholderForm
        actionLabel="Log in"
        fields={[
          { label: "Email address", name: "email", type: "email" },
          { label: "Password", name: "password", type: "password" },
        ]}
        title="Use local credentials"
      />
      <form action="/resend-verification" className="inline-form" method="post">
        <label className="form-field">
          <span>Email address</span>
          <input name="email" type="email" />
        </label>
        <button type="submit">Resend verification email</button>
      </form>
    </ScreenShell>
  );
}

export default function Login() {
  return <LoginView />;
}
