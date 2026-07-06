import styles from "./authenticated-header.module.css";

type NavigationLink = {
  href: string;
  label: string;
};

type AuthenticatedHeaderProps = {
  userEmail: string;
  navigationLinks?: NavigationLink[];
  currentPath?: string;
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
  currentPath,
}: AuthenticatedHeaderProps) {
  return (
    <header className={styles.header}>
      <a href="/board">TICKET TRACKER</a>
      <nav className={styles.nav} aria-label="Primary">
        {navigationLinks.map((link) => {
          const isActive = link.href === currentPath;

          return (
            <a
              href={link.href}
              key={link.href}
              aria-current={isActive ? "page" : undefined}
              className={isActive ? styles.activeLink : undefined}
            >
              {link.label}
            </a>
          );
        })}
      </nav>
      <div className={styles.user}>
        <span>{userEmail}</span>
        <form action="/logout" method="post">
          <button type="submit">Log out</button>
        </form>
      </div>
    </header>
  );
}

export type { AuthenticatedHeaderProps, NavigationLink };
