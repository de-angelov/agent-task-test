import { redirect } from "react-router";

import { requireAuthenticatedUser } from "~/services/session/session.server";

export function meta() {
  return [
    { title: "Project Tracker" },
    {
      name: "description",
      content: "Project Tracker application entry point.",
    },
  ];
}

export async function loader({ request }: { request: Request }) {
  await requireAuthenticatedUser(request);

  return redirect("/board");
}

export default function Home() {
  return null;
}
