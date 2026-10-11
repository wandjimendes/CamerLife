import { useState, type ReactNode } from "react";
import { useGame } from "../../store/game";
import { FinancesApp } from "./apps/FinancesApp";
import { RealEstateApp } from "./apps/RealEstateApp";
import { JobsApp } from "./apps/JobsApp";

type AppKey = "finances" | "social" | "messages" | "realestate" | "food" | "browser" | "taxi" | "jobs";

interface AppDef {
  key: AppKey;
  name: string;
  glyph: string;
  color: string;
  available: boolean;
}

const APPS: AppDef[] = [
  { key: "finances", name: "Finances", glyph: "💰", color: "#1f8a4c", available: true },
  { key: "social", name: "Social", glyph: "📸", color: "#d6336c", available: false },
  { key: "messages", name: "Messages", glyph: "💬", color: "#2563eb", available: false },
  { key: "realestate", name: "Real Estate", glyph: "🏠", color: "#f59e0b", available: true },
  { key: "food", name: "Food", glyph: "🍲", color: "#ef4444", available: false },
  { key: "browser", name: "Browser", glyph: "🌐", color: "#0ea5e9", available: false },
  { key: "taxi", name: "Taxi", glyph: "🚕", color: "#facc15", available: false },
  { key: "jobs", name: "Jobs", glyph: "💼", color: "#7c3aed", available: true },
];

export function AppFrame({ title, onBack, children, tabs }: { title: string; onBack: () => void; children: ReactNode; tabs?: ReactNode }) {
  return (
    <div className="phone-app">
      <div className="app-header">
        <button onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h2>{title}</h2>
      </div>
      {tabs}
      <div className="app-body">{children}</div>
    </div>
  );
}

export function Phone() {
  const open = useGame((s) => s.phoneOpen);
  const setOpen = useGame((s) => s.setPhoneOpen);
  const toast = useGame((s) => s.toast);
  const [app, setApp] = useState<AppKey | null>(null);
  if (!open) return null;

  const goHome = () => setApp(null);
  const time = new Date().toLocaleTimeString("fr-CM", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="phone" onKeyDown={(e) => e.stopPropagation()}>
      <div className="phone-screen">
        <div className="phone-status">
          <span>CamTel 📶</span>
          <span>{time}</span>
          <button className="btn secondary small" style={{ padding: "0 8px" }} onClick={() => setOpen(false)} aria-label="Close phone">
            ✕
          </button>
        </div>
        {app === null && (
          <div className="phone-home">
            {APPS.map((a) => (
              <button
                key={a.key}
                className={`app-icon ${a.available ? "" : "disabled"}`}
                onClick={() => (a.available ? setApp(a.key) : toast(`${a.name} arrives in Phase 2.`))}
              >
                <span className="glyph" style={{ background: a.color }}>
                  {a.glyph}
                </span>
                {a.name}
              </button>
            ))}
          </div>
        )}
        {app === "finances" && <FinancesApp onBack={goHome} />}
        {app === "realestate" && <RealEstateApp onBack={goHome} />}
        {app === "jobs" && <JobsApp onBack={goHome} />}
      </div>
    </div>
  );
}
