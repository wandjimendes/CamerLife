import { useEffect, useState } from "react";
import { formatFcfa, type TransactionRow } from "@cameroon-life/shared";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../store/auth";
import { AppFrame } from "../Phone";

const KIND_LABEL: Record<string, string> = {
  signup_budget: "Starting budget",
  buy_unit: "Property purchase",
  sell_unit: "Property sale",
  rent_paid: "Rent paid",
  rent_received: "Rent received",
  salary: "Salary",
};

export function FinancesApp({ onBack }: { onBack: () => void }) {
  const me = useAuth((s) => s.me);
  const refreshBalance = useAuth((s) => s.refreshBalance);
  const [txs, setTxs] = useState<TransactionRow[] | null>(null);

  useEffect(() => {
    void refreshBalance();
    supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) => setTxs((data as TransactionRow[]) ?? []));
  }, [refreshBalance]);

  return (
    <AppFrame title="Finances" onBack={onBack}>
      <div className="balance-card">
        <div className="label">Mobile Money balance</div>
        <div className="amount">{formatFcfa(me?.balance ?? 0)}</div>
        <div className="label">
          {me?.first_name} {me?.family_name}
        </div>
      </div>
      <div className="card">
        <div className="title">Recent activity</div>
        {txs === null && <div className="empty">Loading…</div>}
        {txs && txs.length === 0 && <div className="empty">No transactions yet.</div>}
        {txs?.map((t) => (
          <div className="tx" key={t.id}>
            <div>
              <div>{KIND_LABEL[t.kind] ?? t.kind}</div>
              <div className="note">
                {t.note} · {new Date(t.created_at).toLocaleDateString()}
              </div>
            </div>
            <div className={`amt ${t.amount >= 0 ? "pos" : "neg"}`}>
              {t.amount >= 0 ? "+" : ""}
              {formatFcfa(t.amount)}
            </div>
          </div>
        ))}
      </div>
    </AppFrame>
  );
}
