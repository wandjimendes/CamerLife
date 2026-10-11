import { formatFcfa } from "@cameroon-life/shared";
import { useAuth } from "../store/auth";
import { useGame } from "../store/game";
import { bridge } from "../game/bridge";
import { isTouchDevice } from "../game/touch";
import { TouchControls } from "./TouchControls";

export function HUD() {
  const me = useAuth((s) => s.me);
  const signOut = useAuth((s) => s.signOut);
  const { connected, onlineCount, prompt, scene, phoneOpen, togglePhone, toasts } = useGame();

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-id">
          <div className="name">
            {me?.first_name} {me?.family_name}
          </div>
          <div className="balance">{formatFcfa(me?.balance ?? 0)}</div>
        </div>
        <div className="meta">
          <span>
            <span className={`dot ${connected ? "on" : ""}`} /> {connected ? "Online" : "Offline"}
          </span>
          <span>👥 {onlineCount}</span>
          <span>📍 {scene === "town" ? "Douala" : scene === "house" ? "Home" : scene === "facility" ? "Work" : "…"}</span>
        </div>
        <button className="btn secondary small" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>

      {prompt && (
        <button className="prompt" onClick={() => bridge.emit("interact")}>
          {!isTouchDevice && <kbd>E</kbd>} {prompt.text}
        </button>
      )}

      {isTouchDevice ? <TouchControls /> : <div className="controls-hint">WASD / arrows to move · E to interact</div>}

      {!phoneOpen && (
        <button className="phone-toggle" onClick={togglePhone} aria-label="Open phone">
          📱
        </button>
      )}
    </div>
  );
}
