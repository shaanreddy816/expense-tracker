// src/ProtectedRoute.jsx
import { useEffect } from "react";
import { useAuth } from "react-oidc-context";

export default function ProtectedRoute({ children }) {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      auth.signinRedirect(); // go to Cognito login
    }
  }, [auth.isLoading, auth.isAuthenticated]);

  if (auth.isLoading) return <div style={{ padding: 20 }}>Loading...</div>;

  // While redirecting to login
  if (!auth.isAuthenticated) return <div style={{ padding: 20 }}>Redirecting to login...</div>;

  return children;
}
