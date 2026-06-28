import { err, ok, type Result } from "neverthrow";

export interface AuthenticatedUser {
  email: string;
  isVerified: true;
}

export type AuthError = "unauthenticated";

const verifiedUserCookieName = "verified_user_email";

export function requireAuthenticatedUser(
  request: Request,
): Result<AuthenticatedUser, AuthError> {
  const cookie = request.headers.get("Cookie");
  const email = getCookieValue(cookie, verifiedUserCookieName)?.trim();

  if (!email) {
    return err("unauthenticated");
  }

  return ok({ email, isVerified: true });
}

function getCookieValue(cookie: string | null, name: string) {
  if (!cookie) {
    return undefined;
  }

  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
