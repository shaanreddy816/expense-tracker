import { useAuth } from "react-oidc-context";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const auth = useAuth();
  const navigate = useNavigate();

  if (auth.isLoading) return <div className="shell"><div className="card"><div className="cardPad">Loading…</div></div></div>;
  if (auth.error) return <div className="shell"><div className="card"><div className="cardPad">Error: {auth.error.message}</div></div></div>;

  return (
    <div className="shell">
      <div className="card">
        <div className="cardPad">
          <div className="heroRow">
            <div className="badge">₹</div>
            <div>
              <h1 className="h1">Expense Tracker</h1>
              <p className="sub">
                Track bills, EMIs, insurance renewals & investments — all in one place.
              </p>
            </div>
          </div>

          <div className="hr" />

          {!auth.isAuthenticated ? (
            <button className="btn btnPrimary" onClick={() => auth.signinRedirect()}>
              Login with Cognito
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div className="pill">✅ You are already logged in.</div>
              <button className="btn btnPrimary" onClick={() => navigate("/dashboard")}>
                Go to Dashboard →
              </button>
            </div>
          )}

          <div className="note">
            Tip: Keep DevTools open → Console/Network when debugging.
          </div>
        </div>
      </div>
    </div>
  );
}