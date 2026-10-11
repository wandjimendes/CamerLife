import { FURNITURE_CATALOG } from "@cameroon-life/shared";
import { useGame } from "../store/game";
import { bridge } from "../game/bridge";
import { Panel } from "./Panel";

/** Shown inside a house. Owners / tenants can place, move and remove furniture. */
export function FurniturePanel() {
  const house = useGame((s) => s.house);
  const placingKey = useGame((s) => s.placingKey);
  const selectedId = useGame((s) => s.selectedFurnitureId);
  const setPlacingKey = useGame((s) => s.setPlacingKey);
  const setSelectedFurnitureId = useGame((s) => s.setSelectedFurnitureId);
  if (!house) return null;

  return (
    <Panel title={house.label} collapseOn={placingKey}>
      <div className="sub">{house.isOwner ? "You own this home." : house.canEdit ? "You rent this home." : "Visiting - listed property."}</div>

      {house.canEdit && (
        <>
          <div className="sub">Pick an item, then tap a floor tile. Tap a placed item to select it, tap elsewhere to move it.</div>
          <div className="catalog">
            {FURNITURE_CATALOG.map((f) => (
              <button key={f.key} className={placingKey === f.key ? "active" : ""} onClick={() => setPlacingKey(placingKey === f.key ? null : f.key)}>
                {f.name}
              </button>
            ))}
          </div>
          {selectedId && (
            <div className="inline-form">
              <span className="sub">Selected item</span>
              <button className="btn danger small" onClick={() => bridge.emit("remove-selected")}>
                Remove
              </button>
              <button className="btn secondary small" onClick={() => setSelectedFurnitureId(null)}>
                Deselect
              </button>
            </div>
          )}
        </>
      )}

      <button className="btn secondary" onClick={() => bridge.emit("exit-house")}>
        Leave house
      </button>
    </Panel>
  );
}
