import { useState } from "react";
import "./Login.css";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!form.username || !form.password) {
      setError("Please fill all fields"); return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = mode === "login"
  ? "https://complaintrack-backend.onrender.com/api/auth/login"
  : "https://complaintrack-backend.onrender.com/api/auth/register";

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        if (mode === "register") {
          setMode("login");
          setError(null);
          alert("Registered! Please login now.");
        } else {
          onLogin({ username: data.username, role: data.role });
        }
      }
    } catch {
      setError("Cannot connect to server. Is Spring Boot running?");
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">⚡</div>
        <h1 className="login-title">ComplainTrack</h1>
        <p className="login-sub">Student Complaint Management System</p>

        <div className="login-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(null); }}>Login</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(null); }}>Register</button>
        </div>

        <div className="login-field">
          <label>Username</label>
          <input
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            placeholder="Enter username"
            onKeyDown={e => e.key === "Enter" && handle()}
          />
        </div>

        <div className="login-field">
          <label>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Enter password"
            onKeyDown={e => e.key === "Enter" && handle()}
          />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button className="login-btn" onClick={handle} disabled={loading}>
          {loading ? "Please wait..." : mode === "login" ? "Login →" : "Register →"}
        </button>

        {mode === "login" && (
          <div className="login-hint">
            <p>🛡️ Admin → username: <strong>admin</strong> / password: <strong>admin123</strong></p>
            <p>👤 Student → username: <strong>pranati</strong> / password: <strong>student123</strong></p>
          </div>
        )}
      </div>
    </div>
  );
}