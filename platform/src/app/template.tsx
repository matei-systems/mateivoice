import type { ReactNode } from "react";

/** Sanfter Seitenübergang bei jeder Navigation (respektiert „Bewegung reduzieren“). */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
