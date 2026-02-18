import { useAuth } from "react-oidc-context";

export default function Dashboard() {
  const auth = useAuth();
  return <div>Dashboard loaded – logged in as {auth.user?.profile?.email}</div>;
}