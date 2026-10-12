import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import api from "../services/api";
import { ErrorState, LoadingState } from "./States";

// Every page except login/register needs the auth cookie; ask the API who we are.
// The customer is passed down through the outlet context (see Home).
// Only a 401 means "not signed in". A network failure or server error is reported
// as such, instead of silently sending the visitor to the login page.
function RequireAuth() {
  const [status, setStatus] = useState("checking");
  const [user, setUser] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    api
      .post("/customers/me")
      .then((response) => {
        if (cancelled) return;
        setUser(response.data);
        setStatus("authed");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus(err.response?.status === 401 ? "denied" : "unreachable");
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setStatus("checking");
    setAttempt((n) => n + 1);
  };

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-cream">
        <LoadingState label="Signing you in…" />
      </div>
    );
  }

  if (status === "denied") {
    return <Navigate to="/login" replace />;
  }

  if (status === "unreachable") {
    return (
      <div className="min-h-screen bg-cream px-4 py-16">
        <ErrorState
          title="Can't reach the server"
          message="The store couldn't connect to its server. Check that the backend is running, then try again."
          onRetry={retry}
        />
      </div>
    );
  }

  return <Outlet context={user} />;
}

export default RequireAuth;
