import React, { useState, useEffect } from "react";
import CitizenView from "./components/CitizenView";
import AdminLogin from "./components/AdminLogin";
import AdminDashboard from "./components/AdminDashboard";

// --- CONFIGURATION CONSTANTS ---
// Customize the Administrator Portal URL route here. 
// For example, set to "/plsms" for https://mydomain.com/plsms
export const ADMIN_ROUTE = "/plsms";

// Customize the hash suffix as an alternative way to access the Administrator Portal.
// For example, set to "#plsms" so https://mydomain.com/#plsms accesses the portal.
export const ADMIN_HASH = "#plsms";

// Additional hashes supported for backward compatibility (optional)
export const SUPPORTED_HASHES = ["#plsms", "#tmodl"];

export default function App() {
  const [isAdminView, setIsAdminView] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  // Initialize Admin Session from Local Storage or Pathname
  useEffect(() => {
    const savedToken = localStorage.getItem("plsms_admin_token");
    const savedUser = localStorage.getItem("plsms_admin_user");
    const savedRole = localStorage.getItem("plsms_admin_role");
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUsername(savedUser);
      setRole(savedRole || "staff");
    }

    const checkPath = () => {
      const hash = window.location.hash.toLowerCase();
      const pathname = window.location.pathname.toLowerCase();

      // Block common admin routes to prevent route discovery / bypass attempts
      const isDisallowedRoute =
        pathname === "/admin" ||
        pathname === "/administrator" ||
        pathname === "/dashboard" ||
        pathname === "/login-admin" ||
        hash === "#admin" ||
        hash === "#administrator" ||
        hash === "#dashboard" ||
        hash === "#login-admin";

      if (isDisallowedRoute) {
        // Redirection to the Public Portal for disallowed URLs
        window.history.replaceState(null, "", "/");
        window.location.hash = "";
        setIsAdminView(false);
        return;
      }

      // Check if the route matches our custom ADMIN_ROUTE or supported admin hashes
      const matchesAdminPath = pathname === ADMIN_ROUTE.toLowerCase();
      const matchesAdminHash = hash === ADMIN_HASH.toLowerCase() || SUPPORTED_HASHES.includes(hash);

      if (matchesAdminPath || matchesAdminHash) {
        setIsAdminView(true);
      } else {
        setIsAdminView(false);
      }
    };

    checkPath();

    window.addEventListener("popstate", checkPath);
    window.addEventListener("hashchange", checkPath);
    return () => {
      window.removeEventListener("popstate", checkPath);
      window.removeEventListener("hashchange", checkPath);
    };
  }, []);

  const navigateToAdmin = () => {
    window.location.hash = ADMIN_HASH;
    window.history.pushState(null, "", ADMIN_ROUTE);
    setIsAdminView(true);
  };

  const navigateToSearch = () => {
    window.location.hash = "";
    window.history.pushState(null, "", "/");
    setIsAdminView(false);
  };

  const handleLoginSuccess = (newToken: string, newUsername: string, newRole: string) => {
    localStorage.setItem("plsms_admin_token", newToken);
    localStorage.setItem("plsms_admin_user", newUsername);
    localStorage.setItem("plsms_admin_role", newRole);
    setToken(newToken);
    setUsername(newUsername);
    setRole(newRole);
    window.location.hash = ADMIN_HASH;
    window.history.pushState(null, "", ADMIN_ROUTE);
    setIsAdminView(true);
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await fetch("/api/admin/logout", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
      }
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      localStorage.removeItem("plsms_admin_token");
      localStorage.removeItem("plsms_admin_user");
      localStorage.removeItem("plsms_admin_role");
      setToken(null);
      setUsername(null);
      setRole(null);
      window.location.hash = "";
      window.history.pushState(null, "", "/");
      setIsAdminView(false);
    }
  };

  // Simple Router
  if (isAdminView) {
    if (token && username) {
      return (
        <AdminDashboard
          token={token}
          username={username}
          role={role || "staff"}
          onLogout={handleLogout}
        />
      );
    } else {
      return (
        <AdminLogin
          onLoginSuccess={handleLoginSuccess}
          onBack={navigateToSearch}
        />
      );
    }
  }

  return (
    <CitizenView />
  );
}
