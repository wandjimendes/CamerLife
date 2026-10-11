import { useEffect, useState, type FormEvent } from "react";
import { CLOTHES_COLORS, HAIR_STYLES, SKIN_TONES, STARTING_BUDGETS, formatFcfa, type FamilyRole } from "@cameroon-life/shared";
import { errorMessage, supabase, supabaseConfigured } from "../lib/supabase";
import { CharacterPreview } from "./CharacterPreview";

type Mode = "login" | "signup";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [familyRole, setFamilyRole] = useState<FamilyRole>("father");
  const [hair, setHair] = useState(0);
  const [skin, setSkin] = useState(0);
  const [clothes, setClothes] = useState(0);
  const [familyAvailable, setFamilyAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // live Family Name availability check (Family Name is unique)
  useEffect(() => {
    const name = familyName.trim();
    if (mode !== "signup" || name.length < 2) {
      setFamilyAvailable(null);
      return;
    }
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc("is_family_name_available", { p_name: name });
      if (!e) setFamilyAvailable(Boolean(data));
    }, 350);
    return () => clearTimeout(t);
  }, [familyName, mode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        if (firstName.trim().length < 1) throw new Error("Enter a first name.");
        if (familyName.trim().length < 2) throw new Error("Family name must be at least 2 characters.");
        if (familyAvailable === false) throw new Error("That family name is already taken.");
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              family_name: familyName.trim(),
              family_role: familyRole,
              hair,
              skin,
              clothes,
            },
          },
        });
        if (err) throw err;
        if (!data.session) setNotice("Check your email to confirm your account, then sign in.");
      }
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg.includes("Database error") ? "Could not create your player - the family name may be taken." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card form" onSubmit={onSubmit}>
        <div>
          <h1>
            Cameroon <span>Life</span>
          </h1>
          <p className="tagline">Douala is waiting. Buy a home, get a job, build your family.</p>
        </div>

        {!supabaseConfigured && (
          <div className="error">VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set - copy apps/client/.env.example to .env.</div>
        )}

        <div className="auth-tabs">
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            New player
          </button>
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Sign in
          </button>
        </div>

        {mode === "signup" && (
          <>
            <div className="row">
              <label className="field">
                First name
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={24} placeholder="Amina" required />
              </label>
              <label className="field">
                Family name
                <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} maxLength={24} placeholder="Ngono" required />
                <span className={familyAvailable === false ? "error" : "hint"}>
                  {familyAvailable === null ? "Must be unique - this founds your family." : familyAvailable ? "✓ Available" : "✗ Already taken"}
                </span>
              </label>
            </div>
            <label className="field">
              Your role in the family
              <select value={familyRole} onChange={(e) => setFamilyRole(e.target.value as FamilyRole)}>
                <option value="father">Father</option>
                <option value="mother">Mother</option>
                <option value="cousin">Cousin</option>
              </select>
            </label>

            <div className="creator">
              <CharacterPreview hair={hair} skin={skin} clothes={clothes} />
              <div className="form">
                <div className="field">
                  Hair
                  <div className="swatches">
                    {HAIR_STYLES.map((name, i) => (
                      <button type="button" key={name} className={`chip ${hair === i ? "active" : ""}`} onClick={() => setHair(i)}>
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  Skin
                  <div className="swatches">
                    {SKIN_TONES.map((c, i) => (
                      <button type="button" key={c} className={`swatch ${skin === i ? "active" : ""}`} style={{ background: c }} onClick={() => setSkin(i)} aria-label={`Skin ${i + 1}`} />
                    ))}
                  </div>
                </div>
                <div className="field">
                  Clothes
                  <div className="swatches">
                    {CLOTHES_COLORS.map((c, i) => (
                      <button type="button" key={c} className={`swatch ${clothes === i ? "active" : ""}`} style={{ background: c }} onClick={() => setClothes(i)} aria-label={`Outfit ${i + 1}`} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="budget-note">
              🎲 Your starting budget is random: {STARTING_BUDGETS.map((b) => formatFcfa(b)).join(" / ")}
            </div>
          </>
        )}

        <div className="row">
          <label className="field">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="field">
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
          </label>
        </div>

        {error && <div className="error">{error}</div>}
        {notice && <div className="hint">{notice}</div>}

        <button className="btn" type="submit" disabled={busy || !supabaseConfigured}>
          {busy ? "Please wait…" : mode === "login" ? "Enter Douala" : "Create my player"}
        </button>
      </form>
    </div>
  );
}
