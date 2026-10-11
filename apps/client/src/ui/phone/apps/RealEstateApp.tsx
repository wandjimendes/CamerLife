import { useCallback, useEffect, useState } from "react";
import { formatFcfa, type ListingStatus, type UnitRow } from "@cameroon-life/shared";
import { errorMessage, supabase } from "../../../lib/supabase";
import { useAuth } from "../../../store/auth";
import { useGame } from "../../../store/game";
import { AppFrame } from "../Phone";

type Tab = "listings" | "mine";

interface UnitWithBuilding extends UnitRow {
  buildings: { name: string; town_id: string; kind: string } | null;
}

export function RealEstateApp({ onBack }: { onBack: () => void }) {
  const me = useAuth((s) => s.me);
  const setBalance = useAuth((s) => s.setBalance);
  const refreshBalance = useAuth((s) => s.refreshBalance);
  const toast = useGame((s) => s.toast);
  const [tab, setTab] = useState<Tab>("listings");
  const [units, setUnits] = useState<UnitWithBuilding[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("units").select("*, buildings(name, town_id, kind)").order("label");
    if (error) toast(errorMessage(error), "error");
    setUnits((data as UnitWithBuilding[]) ?? []);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function rpc(name: string, args: Record<string, unknown>, success: string, unitId: string) {
    setBusy(unitId);
    try {
      const { data, error } = await supabase.rpc(name, args);
      if (error) throw error;
      const res = data as { balance?: number } | null;
      if (res && typeof res.balance === "number") setBalance(Number(res.balance));
      else await refreshBalance();
      toast(success, "success");
      await load();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  const listings = (units ?? []).filter((u) => u.listing_status !== "none" && u.owner_id !== me?.id);
  const mine = (units ?? []).filter((u) => u.owner_id === me?.id || u.tenant_id === me?.id);

  return (
    <AppFrame
      title="Real Estate"
      onBack={onBack}
      tabs={
        <div className="tabs">
          <button className={tab === "listings" ? "active" : ""} onClick={() => setTab("listings")}>
            Listings ({listings.length})
          </button>
          <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>
            My properties ({mine.length})
          </button>
        </div>
      }
    >
      {units === null && <div className="empty">Loading…</div>}

      {tab === "listings" &&
        units &&
        (listings.length === 0 ? (
          <div className="empty">Nothing on the market right now.</div>
        ) : (
          listings.map((u) => (
            <div className="card" key={u.id}>
              <div className="title">
                {u.label} <span className={`badge ${u.listing_status}`}>{u.listing_status === "sale" ? "FOR SALE" : "FOR RENT"}</span>
              </div>
              <div className="line">
                <span>
                  {u.buildings?.name} · {u.buildings?.town_id === "douala" ? "Douala" : "Yaoundé"}
                </span>
                <span>
                  {u.kind} · {u.interior_w}×{u.interior_h}
                </span>
              </div>
              <div className="line">
                <span>{u.owner_id ? "Owner: player" : "Owner: State of Cameroon"}</span>
                <span className="price">{formatFcfa(u.listing_status === "sale" ? (u.sale_price ?? 0) : (u.rent_price ?? 0))}{u.listing_status === "rent" ? " / 30d" : ""}</span>
              </div>
              <div className="actions">
                {u.listing_status === "sale" ? (
                  <button className="btn small" disabled={busy === u.id || (me?.balance ?? 0) < (u.sale_price ?? 0)} onClick={() => void rpc("buy_unit", { p_unit: u.id }, `You bought ${u.label}! 🎉`, u.id)}>
                    {(me?.balance ?? 0) < (u.sale_price ?? 0) ? "Too expensive" : "Buy"}
                  </button>
                ) : (
                  <button className="btn small" disabled={busy === u.id || (me?.balance ?? 0) < (u.rent_price ?? 0)} onClick={() => void rpc("rent_unit", { p_unit: u.id }, `You now rent ${u.label}.`, u.id)}>
                    {(me?.balance ?? 0) < (u.rent_price ?? 0) ? "Too expensive" : "Rent"}
                  </button>
                )}
              </div>
            </div>
          ))
        ))}

      {tab === "mine" &&
        units &&
        (mine.length === 0 ? (
          <div className="empty">You don't own or rent anything yet. Check the listings!</div>
        ) : (
          mine.map((u) => <MyUnitCard key={u.id} unit={u} isOwner={u.owner_id === me?.id} busy={busy === u.id} onList={(status, price) => rpc("set_unit_listing", { p_unit: u.id, p_status: status, p_price: price }, status === "none" ? "Listing removed." : "Listed!", u.id)} />)
        ))}
    </AppFrame>
  );
}

function MyUnitCard({ unit, isOwner, busy, onList }: { unit: UnitWithBuilding; isOwner: boolean; busy: boolean; onList: (status: ListingStatus, price: number | null) => Promise<void> }) {
  const [status, setStatus] = useState<ListingStatus>(unit.listing_status === "none" ? "sale" : unit.listing_status);
  const [price, setPrice] = useState<string>(String(unit.sale_price ?? unit.rent_price ?? ""));

  return (
    <div className="card">
      <div className="title">
        {unit.label}{" "}
        {unit.listing_status !== "none" ? <span className={`badge ${unit.listing_status}`}>{unit.listing_status === "sale" ? "FOR SALE" : "FOR RENT"}</span> : <span className="badge">{isOwner ? "OWNED" : "RENTED"}</span>}
      </div>
      <div className="line">
        <span>{unit.buildings?.name}</span>
        <span>
          {unit.interior_w}×{unit.interior_h} tiles
        </span>
      </div>
      {!isOwner && unit.lease_until && (
        <div className="line">
          <span>Lease ends</span>
          <span>{new Date(unit.lease_until).toLocaleDateString()}</span>
        </div>
      )}
      {isOwner && (
        <>
          {unit.listing_status !== "none" && (
            <div className="line">
              <span>Asking</span>
              <span className="price">{formatFcfa(unit.sale_price ?? unit.rent_price ?? 0)}</span>
            </div>
          )}
          <div className="inline-form">
            <select value={status} onChange={(e) => setStatus(e.target.value as ListingStatus)}>
              <option value="sale">For sale</option>
              <option value="rent">For rent (30d)</option>
            </select>
            <input type="number" min={1} placeholder="Price FCFA" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="actions">
            <button className="btn small" disabled={busy || !Number(price)} onClick={() => void onList(status, Number(price))}>
              {unit.listing_status !== "none" ? "Update listing" : "List it"}
            </button>
            {unit.listing_status !== "none" && (
              <button className="btn secondary small" disabled={busy} onClick={() => void onList("none", null)}>
                Unlist
              </button>
            )}
          </div>
        </>
      )}
      <div className="hint">Walk to the front door in Douala and press E to go inside.</div>
    </div>
  );
}
