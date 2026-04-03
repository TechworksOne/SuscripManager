import { Navigate, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { me } from "../api/auth";

export default function PrivateRoute() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return setOk(false);

    me()
      .then(() => setOk(true))
      .catch(() => {
        localStorage.removeItem("token");
        setOk(false);
      });
  }, []);

  if (ok === null) return null; // o un loader
  if (!ok) return <Navigate to="/login" replace />;

  return <Outlet />;
}
