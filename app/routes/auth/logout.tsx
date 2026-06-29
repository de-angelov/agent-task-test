import { logout } from "~/services/session/session.server";

type ActionArgs = {
  request: Request;
};

export async function action({ request }: ActionArgs) {
  return logout(request);
}
