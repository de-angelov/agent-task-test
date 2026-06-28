type NavigationLink = {
  href: string;
  label: string;
};

type AuthenticatedHeaderProps = {
  userEmail: string;
  navigationLinks?: NavigationLink[];
};

const defaultNavigationLinks: NavigationLink[] = [
  { href: "/board", label: "Board" },
  { href: "/teams", label: "Teams" },
  { href: "/epics", label: "Epics" },
  { href: "/tickets/new", label: "Create ticket" },
];

export function AuthenticatedHeader({
  userEmail,
  navigationLinks = defaultNavigationLinks,
}: AuthenticatedHeaderProps) {
  return (
    <header className="authenticated-header">
      <a href="/board">Project tracker</a>
      <nav className="authenticated-nav" aria-label="Primary">
        {navigationLinks.map((link) => (
          <a href={link.href} key={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
      <div className="authenticated-user">
        <span>{userEmail}</span>
        <form action="/logout" method="post">
          <button type="submit">Log out</button>
        </form>
      </div>
    </header>
  );
}

export type { AuthenticatedHeaderProps, NavigationLink };
