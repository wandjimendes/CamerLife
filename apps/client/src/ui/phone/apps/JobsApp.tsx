import { useCallback, useEffect, useState } from "react";
import { formatFcfa, type EmploymentRow, type JobApplicationRow, type JobRow } from "@cameroon-life/shared";
import { errorMessage, supabase } from "../../../lib/supabase";
import { useGame } from "../../../store/game";
import { AppFrame } from "../Phone";

type Tab = "openings" | "applications" | "myjob";

interface JobWithBuilding extends JobRow {
  buildings: { name: string; slug: string } | null;
}
interface ApplicationWithJob extends JobApplicationRow {
  jobs: (JobRow & { buildings: { name: string } | null }) | null;
}
interface EmploymentWithJob extends EmploymentRow {
  jobs: (JobRow & { buildings: { name: string } | null }) | null;
}

export function JobsApp({ onBack }: { onBack: () => void }) {
  const toast = useGame((s) => s.toast);
  const [tab, setTab] = useState<Tab>("openings");
  const [jobs, setJobs] = useState<JobWithBuilding[] | null>(null);
  const [apps, setApps] = useState<ApplicationWithJob[]>([]);
  const [employment, setEmployment] = useState<EmploymentWithJob | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [j, a, e] = await Promise.all([
      supabase.from("jobs").select("*, buildings(name, slug)").eq("status", "open").order("salary", { ascending: false }),
      supabase.from("job_applications").select("*, jobs(*, buildings(name))").order("created_at", { ascending: false }),
      supabase.from("employment").select("*, jobs(*, buildings(name))").eq("status", "active").maybeSingle(),
    ]);
    setJobs((j.data as JobWithBuilding[]) ?? []);
    setApps((a.data as ApplicationWithJob[]) ?? []);
    setEmployment((e.data as EmploymentWithJob | null) ?? null);
    if (e.data) setTab((t) => (t === "openings" ? "myjob" : t));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function apply(job: JobWithBuilding) {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("apply_for_job", { p_job: job.id, p_message: null });
      if (error) throw error;
      toast(`Application sent for ${job.title}. An admin will review it.`, "success");
      await load();
      setTab("applications");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function resign() {
    if (!confirm("Resign from your job?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("resign_job");
      if (error) throw error;
      toast("You resigned.", "info");
      await load();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  const pendingFor = new Set(apps.filter((a) => a.status === "pending").map((a) => a.job_id));

  return (
    <AppFrame
      title="Jobs"
      onBack={onBack}
      tabs={
        <div className="tabs">
          <button className={tab === "openings" ? "active" : ""} onClick={() => setTab("openings")}>
            Openings
          </button>
          <button className={tab === "applications" ? "active" : ""} onClick={() => setTab("applications")}>
            Applications
          </button>
          <button className={tab === "myjob" ? "active" : ""} onClick={() => setTab("myjob")}>
            My job
          </button>
        </div>
      }
    >
      {jobs === null && <div className="empty">Loading…</div>}

      {tab === "openings" &&
        jobs &&
        (jobs.length === 0 ? (
          <div className="empty">No openings right now. Check back later.</div>
        ) : (
          jobs.map((j) => (
            <div className="card" key={j.id}>
              <div className="title">{j.title}</div>
              <div className="line">
                <span>{j.buildings?.name}</span>
                <span className="price">{formatFcfa(j.salary)} / shift</span>
              </div>
              {j.description && <div className="hint">{j.description}</div>}
              <div className="line">
                <span>{j.slots} slot(s)</span>
                <span>5 min shifts</span>
              </div>
              <div className="actions">
                {employment ? (
                  <span className="hint">You already have a job.</span>
                ) : pendingFor.has(j.id) ? (
                  <span className="badge pending">Application pending</span>
                ) : (
                  <button className="btn small" disabled={busy} onClick={() => void apply(j)}>
                    Apply
                  </button>
                )}
              </div>
            </div>
          ))
        ))}

      {tab === "applications" &&
        (apps.length === 0 ? (
          <div className="empty">You haven't applied anywhere yet.</div>
        ) : (
          apps.map((a) => (
            <div className="card" key={a.id}>
              <div className="title">
                {a.jobs?.title} <span className={`badge ${a.status}`}>{a.status.toUpperCase()}</span>
              </div>
              <div className="line">
                <span>{a.jobs?.buildings?.name}</span>
                <span>{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
              {a.status === "pending" && <div className="hint">Waiting for an admin to approve or reject.</div>}
            </div>
          ))
        ))}

      {tab === "myjob" &&
        (!employment ? (
          <div className="empty">You're unemployed. Browse the openings!</div>
        ) : (
          <div className="card">
            <div className="title">{employment.jobs?.title}</div>
            <div className="line">
              <span>{employment.jobs?.buildings?.name}</span>
              <span className="price">{formatFcfa(employment.salary)} / shift</span>
            </div>
            <div className="line">
              <span>Hired</span>
              <span>{new Date(employment.hired_at).toLocaleDateString()}</span>
            </div>
            <div className="line">
              <span>Last shift</span>
              <span>{employment.last_shift_at ? new Date(employment.last_shift_at).toLocaleString() : "never"}</span>
            </div>
            <div className="budget-note">🏃 To work: walk to {employment.jobs?.buildings?.name} in Douala, press E at the door, then start a shift (5 min + quick tasks).</div>
            <div className="actions">
              <button className="btn secondary small" disabled={busy} onClick={() => void load()}>
                Refresh
              </button>
              <button className="btn danger small" disabled={busy} onClick={() => void resign()}>
                Resign
              </button>
            </div>
          </div>
        ))}
    </AppFrame>
  );
}
