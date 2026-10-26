import { Home, Search, Library, Music, Heart } from "lucide-react";

export default function Sidebar({ activePage = "home", onNavigate }) {
  return (
    <div
      style={{
        width: "240px",
        background: "#000",
        height: "calc(100vh - 90px)",
        padding: "24px 16px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        fixed: "left",
      }}
    >
      {/* Logo / Title */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#1db954", fontWeight: "bold", fontSize: "1.2rem" }}>
        <Music size={28} />
        <span>Spotify Dupe</span>
      </div>

      {/* Menu Utama */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: "#b3b3b3", fontSize: "0.95rem", fontWeight: "bold" }}>
        <button onClick={() => onNavigate?.("home")} style={{ display: "flex", alignItems: "center", gap: "16px", color: activePage === "home" ? "#fff" : "#b3b3b3", cursor: "pointer", background: "none", border: "none", font: "inherit", fontWeight: "bold", padding: 0, textAlign: "left" }}>
          <Home size={22} />
          <span>Home</span>
        </button>
        <button onClick={() => onNavigate?.("search")} style={{ display: "flex", alignItems: "center", gap: "16px", color: activePage === "search" ? "#fff" : "#b3b3b3", cursor: "pointer", background: "none", border: "none", font: "inherit", fontWeight: "bold", padding: 0, textAlign: "left" }}>
          <Search size={22} />
          <span>Cari</span>
        </button>
        <button onClick={() => onNavigate?.("library")} style={{ display: "flex", alignItems: "center", gap: "16px", color: activePage === "library" ? "#fff" : "#b3b3b3", cursor: "pointer", background: "none", border: "none", font: "inherit", fontWeight: "bold", padding: 0, textAlign: "left" }}>
          <Library size={22} />
          <span>Koleksi Kamu</span>
        </button>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #282828", margin: "8px 0" }} />

      {/* Playlist & Favorites */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", color: "#b3b3b3", fontSize: "0.95rem", fontWeight: "bold" }}>
        <button onClick={() => onNavigate?.("library")} style={{ display: "flex", alignItems: "center", gap: "16px", color: "#b3b3b3", cursor: "pointer", background: "none", border: "none", font: "inherit", fontWeight: "bold", padding: 0, textAlign: "left" }}>
          <div style={{ background: "linear-gradient(135deg, #450af5, #c4efd9)", padding: "6px", borderRadius: "4px", display: "flex" }}>
            <Heart size={16} color="#fff" fill="#fff" />
          </div>
          <span>Lagu Disukai</span>
        </button>
      </div>
    </div>
  );
}
