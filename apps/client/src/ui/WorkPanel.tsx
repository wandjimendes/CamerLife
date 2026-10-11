import { useEffect, useState } from "react";
import { SHIFT_DURATION_MS, TownMsg, WORK_PROMPT_TIMEOUT_MS, formatFcfa, type Direction } from "@cameroon-life/shared";
import { net } from "../lib/colyseus";
import { useGame } from "../store/game";
import { bridge } from "../game/bridge";

const ARROW: Record<Direction, string> = { up: "↑", down: "↓", left: "←", right: "→" };
const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

function useNow(active: boolean, every = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Shown while inside a workplace: start a shift, watch the timer, answer prompts. */
export function WorkPanel() {
  const facility = useGame((s) => s.facility);
  const work = useGame((s) => s.work);
  const now = useNow(!!work);
  if (!facility) return null;

  const remaining = work?.endsAt ? work.endsAt - now : 0;
  const progress = work?.startedAt && work.endsAt ? Math.min(1, (now - work.startedAt) / SHIFT_DURATION_MS) : 0;

  return (
    <>
      <div className="panel">
        <h3>{facility.name}</h3>
        <div className="sub">
          {facility.jobTitle} · {formatFcfa(facility.salary)} / shift
        </div>
        {!work ? (
          <>
            <div className="sub">A shift lasts 5 minutes. Stay alert: you'll get quick tasks to prove you're not sleeping on the job.</div>
            <button className="btn" onClick={() => net.town?.send(TownMsg.START_WORK)}>
              Start shift
            </button>
            <button className="btn secondary" onClick={() => bridge.emit("exit-facility")}>
              Leave
            </button>
          </>
        ) : (
          <>
            <div className="work-timer">{mmss(remaining)}</div>
            <div className="progress">
              <div style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="sub">
              Tasks done: {work.promptsAnswered ?? 0} · Misses: {work.misses ?? 0}/{work.maxMisses ?? 2}
            </div>
            <button className="btn danger" onClick={() => net.town?.send(TownMsg.STOP_WORK)}>
              Quit shift (no pay)
            </button>
          </>
        )}
      </div>
      <MiniGame />
    </>
  );
}

/** Anti-AFK task: reproduce an arrow sequence before the timer runs out. */
function MiniGame() {
  const prompt = useGame((s) => s.workPrompt);
  const setWorkPrompt = useGame((s) => s.setWorkPrompt);
  const [typed, setTyped] = useState<Direction[]>([]);
  const [wrong, setWrong] = useState(false);
  const now = useNow(!!prompt, 100);

  useEffect(() => {
    setTyped([]);
    setWrong(false);
  }, [prompt?.promptId]);

  function press(dir: Direction) {
    if (!prompt || wrong) return;
    const next = [...typed, dir];
    if (prompt.sequence[next.length - 1] !== dir) {
      setWrong(true);
      net.town?.send(TownMsg.WORK_ANSWER, { promptId: prompt.promptId, sequence: next });
      setTimeout(() => setWorkPrompt(null), 600);
      return;
    }
    setTyped(next);
    if (next.length === prompt.sequence.length) {
      net.town?.send(TownMsg.WORK_ANSWER, { promptId: prompt.promptId, sequence: next });
      setTimeout(() => setWorkPrompt(null), 300);
    }
  }

  useEffect(() => {
    if (!prompt) return;
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_TO_DIR[e.key] ?? KEY_TO_DIR[e.key.toLowerCase()];
      if (dir) {
        e.preventDefault();
        press(dir);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  useEffect(() => {
    if (prompt && now > prompt.expiresAt + 500) setWorkPrompt(null);
  }, [now, prompt, setWorkPrompt]);

  if (!prompt) return null;
  const left = Math.max(0, prompt.expiresAt - now);

  return (
    <div className="minigame">
      <div className="minigame-card">
        <h2>🚨 Patient needs you!</h2>
        <div className="sub">Press the arrows in order</div>
        <div className="arrows">
          {prompt.sequence.map((d, i) => (
            <div key={i} className={`arrow ${i < typed.length ? "done" : ""} ${wrong && i === typed.length ? "wrong" : ""}`}>
              {ARROW[d]}
            </div>
          ))}
        </div>
        <div className="timeout-bar">
          <div style={{ width: `${(left / WORK_PROMPT_TIMEOUT_MS) * 100}%` }} />
        </div>
        <div className="arrow-pad">
          <span />
          <button className="arrow" onClick={() => press("up")}>↑</button>
          <span />
          <button className="arrow" onClick={() => press("left")}>←</button>
          <button className="arrow" onClick={() => press("down")}>↓</button>
          <button className="arrow" onClick={() => press("right")}>→</button>
        </div>
      </div>
    </div>
  );
}
