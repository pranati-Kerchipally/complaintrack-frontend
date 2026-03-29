import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import Login from "./Login";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = "http://localhost:8080/api/complaints";
const CATEGORIES = ["Infrastructure", "Academic", "Hostel", "IT Support", "Administration"];

export default function App() {
  const [user, setUser] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [form, setForm] = useState({ studentName: "", category: "", description: "" });
  const [tab, setTab] = useState("student");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [gestureMode, setGestureMode] = useState(false);
  const [gesture, setGesture] = useState(null);
  const [gestureAction, setGestureAction] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [showCamera, setShowCamera] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);

  const smoothYRef = useRef(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);
  const lastGestureRef = useRef(null);
  const gestureTimerRef = useRef(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchComplaints = useCallback(async () => {
    try {
      const res = await fetch(API);
      if (res.ok) { const data = await res.json(); setComplaints(data); }
    } catch { }
  }, []);

  useEffect(() => { fetchComplaints(); }, [fetchComplaints]);

  const updateStatus = useCallback(async (id, status) => {
    try {
      await fetch(`${API}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, priority: "High" }),
      });
    } catch { }
    setComplaints(p => p.map(c => c.id === id ? { ...c, status } : c));
    showToast(`Status updated to ${status}`);
  }, []);

  const handleSubmit = async () => {
    if (!form.studentName || !form.category || !form.description) {
      showToast("Please fill all fields", "error"); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: "Pending", priority: "Medium" }),
      });
      if (res.ok) {
        const saved = await res.json();
        setComplaints(p => [...p, saved]);
      }
    } catch { }
    setForm({ studentName: "", category: "", description: "" });
    setSubmitting(false);
    showToast("Complaint submitted successfully!");
  };

  const countFingers = (lm) => {
    const tips = [8, 12, 16, 20];
    const bases = [6, 10, 14, 18];
    let count = 0;
    tips.forEach((tip, i) => { if (lm[tip].y < lm[bases[i]].y) count++; });
    if (lm[4].x < lm[3].x) count++;
    return count;
  };

  const detectGesture = (lm) => {
    const thumbUp = lm[4].y < lm[3].y && lm[4].y < lm[8].y;
    const othersDown = [8, 12, 16, 20].every(i => lm[i].y > lm[i - 2].y);
    if (thumbUp && othersDown) return "RESOLVE";
    const fingers = countFingers(lm);
    if (fingers === 2) return "INPROGRESS";
    if (fingers === 5) return "SCROLL";
    if (fingers === 1) return "SELECT";
    return null;
  };

  const handleGestureAction = useCallback((g, currentComplaints, currentSelectedId) => {
    if (!g || g === lastGestureRef.current) return;
    lastGestureRef.current = g;
    clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = setTimeout(() => { lastGestureRef.current = null; }, 2500);
    const target = currentSelectedId || currentComplaints[0]?.id;
    if (!target) return;
    if (g === "RESOLVE") { updateStatus(target, "Resolved"); setGestureAction("👍 Resolved #" + target); }
    else if (g === "INPROGRESS") { updateStatus(target, "In Progress"); setGestureAction("✌️ In Progress #" + target); }
    else if (g === "SELECT") { setGestureAction("☝️ Card selected"); }
    else if (g === "SCROLL") { setGestureAction("✋ Scrolling..."); }
    setTimeout(() => setGestureAction(null), 2000);
  }, [updateStatus]);

  const stopGesture = useCallback(() => {
    try { cameraRef.current?.stop(); } catch {}
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    try { handsRef.current?.close(); } catch {}
    cameraRef.current = null;
    streamRef.current = null;
    handsRef.current = null;
    setGestureMode(false);
    setShowCamera(false);
    setGesture(null);
    setHoveredId(null);
    showToast("Gesture control disabled");
  }, []);

  const startGesture = useCallback(async () => {
    try { cameraRef.current?.stop(); } catch {}
    try { handsRef.current?.close(); } catch {}
    cameraRef.current = null;
    handsRef.current = null;

    setShowCamera(true);
    setGestureMode(true);

    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const { Hands } = await import("@mediapipe/hands");
      const { Camera } = await import("@mediapipe/camera_utils");

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;

      if (!videoRef.current) {
        showToast("Video not ready. Try again.", "error");
        setShowCamera(false);
        setGestureMode(false);
        return;
      }

      videoRef.current.srcObject = stream;

      await new Promise(resolve => {
        if (videoRef.current) videoRef.current.onloadedmetadata = () => resolve();
        setTimeout(resolve, 2000);
      });

      const hands = new Hands({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
      });

      hands.onResults((results) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.multiHandLandmarks?.length > 0) {
          const lm = results.multiHandLandmarks[0];

          ctx.fillStyle = "#6366f1";
          lm.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, 2 * Math.PI);
            ctx.fill();
          });

          ctx.strokeStyle = "#818cf8";
          ctx.lineWidth = 2;
          [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
           [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
           [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]
          ].forEach(([a, b]) => {
            ctx.beginPath();
            ctx.moveTo(lm[a].x * canvas.width, lm[a].y * canvas.height);
            ctx.lineTo(lm[b].x * canvas.width, lm[b].y * canvas.height);
            ctx.stroke();
          });

          const tipX = lm[8].x * canvas.width;
          const tipY = lm[8].y * canvas.height;
          ctx.beginPath();
          ctx.arc(tipX, tipY, 12, 0, 2 * Math.PI);
          ctx.strokeStyle = "#c084fc";
          ctx.lineWidth = 3;
          ctx.stroke();

          const g = detectGesture(lm);
setGesture(g);

const rawY = lm[9].y;

// smoothing formula
smoothYRef.current = 0.2 * rawY + 0.8 * smoothYRef.current;

const handY = smoothYRef.current;

          if (g === "SCROLL") {
            if (handY < 0.35) {
              window.scrollBy({ top: -30, behavior: "smooth" });
            } else if (handY > 0.65) {
              window.scrollBy({ top: 30, behavior: "smooth" });
            }
          }

          setComplaints(current => {
            if (current.length > 0) {
              const index = Math.floor(handY * current.length);
              const clamped = Math.max(0, Math.min(index, current.length - 1));
              const newHoveredId = current[clamped]?.id;
              setHoveredId(newHoveredId);
              setSelectedId(newHoveredId);
              if (g === "RESOLVE" || g === "INPROGRESS") {
  handleGestureAction(g, current, newHoveredId);
}
            }
            return current;
          });

        } else {
          setGesture(null);
          setHoveredId(null);
        }
      });

      handsRef.current = hands;

      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current && handsRef.current) {
            try { await handsRef.current.send({ image: videoRef.current }); } catch {}
          }
        },
        width: 320,
        height: 240,
      });

      camera.start();
      cameraRef.current = camera;
      showToast("👋 Gesture control enabled!");

    } catch (e) {
      console.error(e);
      showToast("Camera access denied!", "error");
      setShowCamera(false);
      setGestureMode(false);
    }
  // eslint-disable-next-line
  }, [handleGestureAction]);

  // ── ALL HOOKS DONE ──
  if (!user) return <Login onLogin={setUser} />;

  // ── PDF DOWNLOAD ──
  const downloadPDF = () => {
    const doc = new jsPDF();

    // HEADER
    doc.setFillColor(26, 29, 46);
    doc.rect(0, 0, 210, 40, "F");
    doc.setTextColor(129, 140, 248);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("ComplainTrack", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text("Student Complaint Management System", 14, 26);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 33);
    doc.text(`Generated by: Admin`, 150, 33);

    // STATS BOXES
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Dashboard Summary", 14, 52);

    const statsData = [
      ["Total", complaints.length],
      ["Pending", complaints.filter(c => c.status === "Pending").length],
      ["In Progress", complaints.filter(c => c.status === "In Progress").length],
      ["Resolved", complaints.filter(c => c.status === "Resolved").length],
    ];
    const boxColors = {
      "Total": [129, 140, 248],
      "Pending": [245, 158, 11],
      "In Progress": [59, 130, 246],
      "Resolved": [34, 197, 94],
    };
    statsData.forEach((s, i) => {
      const x = 14 + i * 46;
      doc.setFillColor(...boxColors[s[0]]);
      doc.roundedRect(x, 56, 42, 20, 3, 3, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(String(s[1]), x + 21, 65, { align: "center" });
      doc.setFontSize(8);
      doc.text(s[0].toUpperCase(), x + 21, 71, { align: "center" });
    });

    // CATEGORY TABLE
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Complaints by Category", 14, 90);

    const categoryRows = CATEGORIES.map(cat => {
      const total = complaints.filter(c => c.category === cat).length;
      const pending = complaints.filter(c => c.category === cat && c.status === "Pending").length;
      const inProg = complaints.filter(c => c.category === cat && c.status === "In Progress").length;
      const resolved = complaints.filter(c => c.category === cat && c.status === "Resolved").length;
      return [cat, total, pending, inProg, resolved];
    }).filter(r => r[1] > 0);

    autoTable(doc, {
      startY: 94,
      head: [["Category", "Total", "Pending", "In Progress", "Resolved"]],
      body: categoryRows,
      headStyles: { fillColor: [26, 29, 46], textColor: [129, 140, 248], fontStyle: "bold", fontSize: 10 },
      bodyStyles: { fontSize: 9, textColor: [30, 30, 30] },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      margin: { left: 14, right: 14 },
    });

    // ALL COMPLAINTS TABLE
    const afterCategoryY = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    doc.text("All Complaints", 14, afterCategoryY);

    const complaintRows = complaints.map(c => [
      `#${c.id}`,
      c.studentName,
      c.category,
      c.description.length > 50 ? c.description.slice(0, 50) + "..." : c.description,
      c.status,
      c.priority,
    ]);

    autoTable(doc, {
      startY: afterCategoryY + 4,
      head: [["ID", "Student", "Category", "Description", "Status", "Priority"]],
      body: complaintRows,
      headStyles: { fillColor: [26, 29, 46], textColor: [129, 140, 248], fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 28 },
        2: { cellWidth: 28 },
        3: { cellWidth: 70 },
        4: { cellWidth: 24 },
        5: { cellWidth: 20 },
      },
      margin: { left: 14, right: 14 },
    });

    // FOOTER
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`ComplainTrack Report — Page ${i} of ${pageCount}`, 105, 290, { align: "center" });
    }

    doc.save(`ComplainTrack-Report-${new Date().toLocaleDateString()}.pdf`);
    showToast("📄 PDF Report downloaded!");
  };

  const stats = {
    total: complaints.length,
    pending: complaints.filter(c => c.status === "Pending").length,
    inProgress: complaints.filter(c => c.status === "In Progress").length,
    resolved: complaints.filter(c => c.status === "Resolved").length,
  };

  const pieData = [
    { name: "Pending", value: stats.pending, color: "#f59e0b" },
    { name: "In Progress", value: stats.inProgress, color: "#3b82f6" },
    { name: "Resolved", value: stats.resolved, color: "#22c55e" },
    { name: "Rejected", value: complaints.filter(c => c.status === "Rejected").length, color: "#ef4444" },
  ].filter(d => d.value > 0);

  const barData = CATEGORIES.map(cat => ({
    name: cat.length > 10 ? cat.slice(0, 10) + ".." : cat,
    count: complaints.filter(c => c.category === cat).length,
  })).filter(d => d.count > 0);

  const statusColor = (status) => {
    if (status === "Pending") return { bg: "#fef3c7", color: "#d97706" };
    if (status === "In Progress") return { bg: "#dbeafe", color: "#2563eb" };
    if (status === "Resolved") return { bg: "#dcfce7", color: "#16a34a" };
    if (status === "Rejected") return { bg: "#fee2e2", color: "#dc2626" };
    return { bg: "#f3f4f6", color: "#6b7280" };
  };

  const gestureLabel = (g) => {
    if (g === "RESOLVE") return "👍 Thumbs Up → Resolving...";
    if (g === "INPROGRESS") return "✌️ Two Fingers → In Progress...";
    if (g === "SCROLL") return "✋ Open Palm → Move hand UP/DOWN to scroll";
    if (g === "SELECT") return "☝️ Pointing → Select";
    return null;
  };

  const baseComplaints = user.role === "STUDENT"
    ? complaints.filter(c => c.studentName.toLowerCase().includes(user.username.toLowerCase()))
    : complaints;

  const visibleComplaints = baseComplaints
    .filter(c => filterStatus === "All" ? true : c.status === filterStatus)
    .filter(c =>
      c.studentName.toLowerCase().startsWith(user.username.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div className="app">
      {/* NAVBAR */}
      <nav className="navbar">
        <span className="brand">⚡ ComplainTrack</span>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className="nav-badge">
            {user.role === "ADMIN" ? "🛡️ Admin" : "👤 Student"} — {user.username}
          </span>
          <button onClick={() => { stopGesture(); setUser(null); }} style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            color: "#f87171", padding: "6px 14px", borderRadius: "8px",
            cursor: "pointer", fontSize: "13px", fontFamily: "'DM Sans', sans-serif"
          }}>Logout</button>
        </div>
      </nav>

      {/* STATS */}
      <div className="stats-row">
        <div className="stat-card"><div className="stat-num purple">{stats.total}</div><div className="stat-label">Total</div></div>
        <div className="stat-card"><div className="stat-num yellow">{stats.pending}</div><div className="stat-label">Pending</div></div>
        <div className="stat-card"><div className="stat-num blue">{stats.inProgress}</div><div className="stat-label">In Progress</div></div>
        <div className="stat-card"><div className="stat-num green">{stats.resolved}</div><div className="stat-label">Resolved</div></div>
      </div>

      {/* CHARTS */}
      <div className="charts-row">
        <div className="chart-card">
          <h3 className="chart-title">📊 Status Overview</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#e2e8f0" }} />
              <Legend iconType="circle" wrapperStyle={{ color: "#94a3b8", fontSize: "12px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3 className="chart-title">📈 Complaints by Category</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1a1d2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#e2e8f0" }} />
              <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TABS */}
      <div className="tabs">
        <button className={`tab ${tab === "student" ? "active" : ""}`} onClick={() => setTab("student")}>📝 Submit Complaint</button>
        {user.role === "ADMIN" && (
          <button className={`tab ${tab === "admin" ? "active" : ""}`} onClick={() => setTab("admin")}>🛡️ Admin Dashboard</button>
        )}
      </div>

      <div className="main">
        {/* LEFT PANEL */}
        <div className="panel left">
          {tab === "student" ? (
            <>
              <h2 className="panel-title">Raise a Complaint</h2>
              <div className="field">
                <label>Your Name</label>
                <input value={form.studentName} onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))} placeholder="e.g. Pranati K." />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">Select category...</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe your issue clearly..." />
              </div>
              <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Complaint →"}
              </button>
            </>
          ) : (
            <>
              {/* GESTURE CONTROL HEADER WITH PDF BUTTON */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "16px", fontWeight: 700 }}>🤙 Gesture Control</h2>
                <button onClick={downloadPDF} style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  border: "none", borderRadius: "10px", color: "white",
                  padding: "8px 14px", fontSize: "12px", fontWeight: 600,
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif"
                }}>📄 Download PDF</button>
              </div>

              <div className="gesture-guide">
                {[["👍","Thumbs Up","Mark Resolved"],
                  ["✌️","Two Fingers","Mark In Progress"],
                  ["☝️","Point","Select Card"],
                  ["✋","Open Palm","Scroll"]].map(([icon, name, action]) => (
                  <div key={name} className="gesture-item">
                    <span className="gesture-icon">{icon}</span>
                    <div><strong>{name}</strong><br /><small>{action}</small></div>
                  </div>
                ))}
              </div>

              <button
                className={`btn-gesture ${gestureMode ? "active" : ""}`}
                onClick={gestureMode ? stopGesture : startGesture}>
                {gestureMode ? "🔴 Stop Gesture Control" : "🤙 Enable Gesture Control"}
              </button>

              <div className="camera-box" style={{ display: showCamera ? "block" : "none" }}>
                <video ref={videoRef} autoPlay muted playsInline />
                <canvas ref={canvasRef} width={320} height={240} />
              </div>

              {gestureMode && (
                <div className="gesture-tip">
                  Move hand <strong>up/down</strong> to select card →
                  then show gesture to act on it
                </div>
              )}

              {gesture && gestureLabel(gesture) && (
                <div className="gesture-detected">{gestureLabel(gesture)}</div>
              )}
              {gestureAction && (
                <div className="gesture-action">{gestureAction}</div>
              )}
              {gestureMode && hoveredId && (
                <div className="selected-info">🎯 Hovering card #{hoveredId}</div>
              )}
            </>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="panel right">
          <h2 className="panel-title">
            {tab === "student" ? `My Complaints (${visibleComplaints.length})` : `All Complaints (${complaints.length})`}
          </h2>

          {/* SEARCH & FILTER */}
          <div className="search-filter-row">
            <input
              className="search-input"
              placeholder="🔍 Search by name, category, description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="filter-btns">
              {["All", "Pending", "In Progress", "Resolved", "Rejected"].map(s => (
                <button
                  key={s}
                  className={`filter-btn ${filterStatus === s ? "active" : ""}`}
                  onClick={() => setFilterStatus(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {visibleComplaints.length === 0 ? (
            <div className="empty">📭 No complaints found</div>
          ) : (
            visibleComplaints.map(c => {
              const sc = statusColor(c.status);
              const isHovered = gestureMode && hoveredId === c.id;
              return (
                <div key={c.id}
                  className={`complaint-card ${selectedId === c.id ? "selected" : ""} ${isHovered ? "gesture-hover" : ""}`}
                  onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}>
                  <div className="card-top">
                    <span className="student-name">
                      {isHovered && "👆 "}{c.studentName}
                    </span>
                    <span className="status-badge" style={{ background: sc.bg, color: sc.color }}>{c.status}</span>
                  </div>
                  <div className="card-category">
  {c.createdAt && (
  <span style={{ marginLeft: 8, color: "#475569" }}>
    · 🕐 {(() => {
      const date = new Date(c.createdAt);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffMins < 60) return `${diffMins} mins ago`;
      if (diffHours < 24) return `${diffHours} hours ago`;
      if (diffDays === 1) return `Yesterday`;
      if (diffDays < 7) return `${diffDays} days ago`;
      return date.toLocaleDateString();
    })()}
  </span>
)}
</div>
                  <div className="card-desc">{c.description}</div>
                  {tab === "admin" && (
                    <div className="card-actions">
                      <button className="btn-inprogress" onClick={e => { e.stopPropagation(); updateStatus(c.id, "In Progress"); }}>In Progress</button>
                      <button className="btn-resolve" onClick={e => { e.stopPropagation(); updateStatus(c.id, "Resolved"); }}>✓ Resolve</button>
                      <button className="btn-reject" onClick={e => { e.stopPropagation(); updateStatus(c.id, "Rejected"); }}>✕ Reject</button>
                      <button className="btn-delete" onClick={e => {
                        e.stopPropagation();
                        fetch(`${API}/${c.id}`, { method: "DELETE" })
                        .then(() => {
                          setComplaints(p => p.filter(x => x.id !== c.id));
                          showToast("🗑️ Complaint deleted");
                        });
                        }}>🗑️ Delete</button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {toast && <div className={`toast ${toast.type === "error" ? "error" : ""}`}>{toast.msg}</div>}
    </div>
  );
}