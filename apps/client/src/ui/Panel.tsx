import { useEffect, useState, type ReactNode } from "react";
import { SMALL_SCREEN } from "../game/touch";

/**
 * Side panel (desktop) / top sheet (phones) with a collapse toggle so it can
 * get out of the way of the game view - useful on small screens where it
 * would otherwise cover the room you're furnishing.
 */
export function Panel({
  title,
  children,
  collapseOn,
}: {
  title: string;
  children: ReactNode;
  /** When this turns truthy on a small screen the panel collapses (e.g. an item was picked and the floor is needed). */
  collapseOn?: unknown;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (collapseOn && window.innerWidth < SMALL_SCREEN) setCollapsed(true);
  }, [collapseOn]);
  return (
    <div className={`panel ${collapsed ? "collapsed" : ""}`}>
      <div className="panel-head">
        <h3>{title}</h3>
        <button
          type="button"
          className="panel-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "▾" : "▴"}
        </button>
      </div>
      {!collapsed && <div className="panel-body">{children}</div>}
    </div>
  );
}
