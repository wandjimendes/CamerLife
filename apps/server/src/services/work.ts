import type { Client, Clock, Delayed } from "colyseus";
import {
  SHIFT_DURATION_MS,
  TownMsg,
  WORK_MAX_MISSES,
  WORK_PROMPT_MAX_MS,
  WORK_PROMPT_MIN_MS,
  WORK_PROMPT_TIMEOUT_MS,
  WORK_SEQUENCE_LENGTH,
  type Direction,
  type WorkAnswerPayload,
  type WorkPromptPayload,
  type WorkResultPayload,
  type WorkStatePayload,
} from "@cameroon-life/shared";
import { abandonShift, completeShift, type StartedShift } from "./db.ts";

const DIRS: Direction[] = ["up", "down", "left", "right"];

function randomSequence(): Direction[] {
  return Array.from({ length: WORK_SEQUENCE_LENGTH }, () => DIRS[Math.floor(Math.random() * DIRS.length)]);
}

interface PendingPrompt {
  id: string;
  sequence: Direction[];
  expiresAt: number;
  timer: Delayed;
}

/**
 * One "Go To Work" shift: a 5 minute timer mixed with anti-AFK mini-game
 * prompts. The server owns the clock and the payout.
 */
export class WorkSession {
  readonly startedAt = Date.now();
  readonly endsAt = this.startedAt + SHIFT_DURATION_MS;
  misses = 0;
  answered = 0;
  private pending: PendingPrompt | null = null;
  private promptTimer: Delayed | null = null;
  private endTimer: Delayed;
  private finished = false;

  constructor(
    private readonly client: Client,
    private readonly clock: Clock,
    readonly shift: StartedShift,
    readonly buildingSlug: string,
    private readonly onFinish: (session: WorkSession, result: WorkResultPayload) => void,
  ) {
    this.endTimer = this.clock.setTimeout(() => void this.finish(true), SHIFT_DURATION_MS);
    this.scheduleNextPrompt();
    this.sendState();
  }

  toState(): WorkStatePayload {
    return {
      active: !this.finished,
      shiftId: this.shift.shift_id,
      jobTitle: this.shift.job_title,
      buildingSlug: this.buildingSlug,
      salary: this.shift.salary,
      startedAt: this.startedAt,
      endsAt: this.endsAt,
      misses: this.misses,
      maxMisses: WORK_MAX_MISSES,
      promptsAnswered: this.answered,
    };
  }

  sendState() {
    this.client.send(TownMsg.WORK_STATE, this.toState());
  }

  private scheduleNextPrompt() {
    const delay = WORK_PROMPT_MIN_MS + Math.random() * (WORK_PROMPT_MAX_MS - WORK_PROMPT_MIN_MS);
    // don't schedule a prompt that would expire after the shift ends
    if (Date.now() + delay + WORK_PROMPT_TIMEOUT_MS >= this.endsAt) return;
    this.promptTimer = this.clock.setTimeout(() => this.sendPrompt(), delay);
  }

  private sendPrompt() {
    if (this.finished) return;
    const id = Math.random().toString(36).slice(2, 10);
    const sequence = randomSequence();
    const expiresAt = Date.now() + WORK_PROMPT_TIMEOUT_MS;
    const timer = this.clock.setTimeout(() => this.onMiss("timeout"), WORK_PROMPT_TIMEOUT_MS);
    this.pending = { id, sequence, expiresAt, timer };
    const payload: WorkPromptPayload = { promptId: id, sequence, expiresAt };
    this.client.send(TownMsg.WORK_PROMPT, payload);
  }

  answer(payload: WorkAnswerPayload) {
    if (this.finished || !this.pending || payload?.promptId !== this.pending.id) return;
    const ok =
      Array.isArray(payload.sequence) &&
      payload.sequence.length === this.pending.sequence.length &&
      payload.sequence.every((d, i) => d === this.pending!.sequence[i]);
    this.pending.timer.clear();
    this.pending = null;
    if (ok) {
      this.answered++;
      this.sendState();
      this.scheduleNextPrompt();
    } else {
      this.onMiss("wrong");
    }
  }

  private onMiss(_reason: "timeout" | "wrong") {
    if (this.finished) return;
    this.pending = null;
    this.misses++;
    if (this.misses >= WORK_MAX_MISSES) {
      void this.finish(false);
      return;
    }
    this.sendState();
    this.scheduleNextPrompt();
  }

  /** Player left / disconnected / stopped: no payout. */
  async abandon() {
    if (this.finished) return;
    this.finished = true;
    this.clearTimers();
    await abandonShift(this.shift.shift_id);
    this.onFinish(this, {
      shiftId: this.shift.shift_id,
      status: "abandoned",
      payout: 0,
      message: "Shift abandoned - no pay.",
    });
  }

  private async finish(success: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.clearTimers();
    let result: WorkResultPayload;
    try {
      const { payout, balance } = await completeShift(this.shift.shift_id, success);
      result = {
        shiftId: this.shift.shift_id,
        status: success ? "completed" : "failed",
        payout,
        balance,
        message: success
          ? `Shift complete! You earned ${payout.toLocaleString("fr-FR")} FCFA.`
          : "You missed too many tasks. Shift failed - no pay.",
      };
    } catch (err) {
      console.error("[work] completeShift failed", err);
      result = {
        shiftId: this.shift.shift_id,
        status: "failed",
        payout: 0,
        message: "Could not record the shift. Please try again.",
      };
    }
    this.onFinish(this, result);
  }

  private clearTimers() {
    this.endTimer.clear();
    this.promptTimer?.clear();
    this.pending?.timer.clear();
    this.pending = null;
  }
}
