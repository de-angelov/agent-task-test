import { useState } from "react";

import { Button } from "~/components/button";
import { Dialog } from "~/components/dialog";
import { getPlaceholderMessage } from "~/services/placeholder.server";
import { requireAuthenticatedUser } from "~/services/session.server";

export function meta() {
  return [
    { title: "Project Placeholder" },
    {
      name: "description",
      content: "Minimal React Router application placeholder.",
    },
  ];
}

export async function loader({ request }: { request: Request }) {
  await requireAuthenticatedUser(request);

  const message = getPlaceholderMessage();

  if (message.isOk()) {
    return message.value;
  }

  throw new Error("Unexpected placeholder service failure.");
}

export function HomeView() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <main className="page">
      <h1>Application placeholder</h1>
      <p>React Router is rendering.</p>
      <Button onClick={() => setIsDialogOpen(true)}>Continue</Button>
      <nav className="top-links" aria-label="Placeholder screens">
        <a href="/signup">Sign up</a>
        <a href="/login">Log in</a>
        <a href="/board">Board</a>
        <a href="/teams">Teams</a>
        <a href="/epics">Epics</a>
      </nav>
      <Dialog
        cancelAction={
          <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>
            Cancel
          </Button>
        }
        confirmAction={
          <Button onClick={() => setIsDialogOpen(false)}>Confirm</Button>
        }
        isOpen={isDialogOpen}
        onCancel={() => setIsDialogOpen(false)}
        title="Continue from placeholder"
      >
        Confirm that you want to continue from the application placeholder.
      </Dialog>
    </main>
  );
}

export default function Home() {
  return <HomeView />;
}
