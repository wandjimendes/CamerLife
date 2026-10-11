import { useEffect } from "react";
import { useAuth } from "./store/auth";
import { AuthScreen } from "./ui/AuthScreen";
import { GameView } from "./ui/GameView";

export default function App() {
  const { session, me, loading, init, signOut } = useAuth();

  useEffect(() => {
    void init();
  }, [init]);

  if (loading) return <div className="center-screen">Loading Cameroon Life…</div>;
  if (!session) return <AuthScreen />;
  if (!me) {
    return (
      <div className="center-screen" style={{ flexDirection: "column", gap: 12 }}>
        <div>Your player profile is missing. Did you run the Supabase migrations and seed?</div>
        <button className="btn secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  }
  return <GameView />;
}
