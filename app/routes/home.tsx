import { getPlaceholderMessage } from "~/services/placeholder.server";

export function meta() {
  return [
    { title: "Project Placeholder" },
    {
      name: "description",
      content: "Minimal React Router application placeholder.",
    },
  ];
}

export async function loader() {
  const message = getPlaceholderMessage();

  if (message.isOk()) {
    return message.value;
  }

  throw new Error("Unexpected placeholder service failure.");
}

export function HomeView() {
  return (
    <main className="page">
      <h1>Application placeholder</h1>
      <p>React Router is rendering.</p>
    </main>
  );
}

export default function Home() {
  return <HomeView />;
}
