import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { X, Maximize2, Minimize2 } from "lucide-react";

const API = import.meta.env.VITE_API_BASE_URL || "/api";

const parseLyrics = (text) => {
  const lines = text.split("\n");
  const parsed = [];
  const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;

  lines.forEach((line) => {
    const match = line.match(regex);
    if (match) {
      const min = Number.parseInt(match[1], 10);
      const sec = Number.parseInt(match[2], 10);
      const fractionText = match[3] || "";
      const fraction = fractionText ? Number.parseInt(fractionText, 10) / (fractionText.length === 3 ? 1000 : 100) : 0;
      const time = min * 60 + sec + fraction;
      const textAfterTimestamp = match[4].trim();
      if (textAfterTimestamp) parsed.push({ time, text: textAfterTimestamp });
    } else if (line.trim() && !/^\[[^\]]+\]$/.test(line.trim())) {
      parsed.push({ time: null, text: line.trim() });
    }
  });
  return parsed.sort((a, b) => {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time - b.time;
  });
};

export default function LyricsModal({ currentTrack, currentTime, activeList, onSelectTrack, onClose }) {
  const [lyrics, setLyrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [suggestedNext, setSuggestedNext] = useState({ videoId: null, tracks: [] });
  const activeRef = useRef(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => console.error(err));
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    let active = true;
    const fetchLyrics = async () => {
      if (!currentTrack?.videoId) {
        setLyrics([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setLyrics([]);
      try {
        const response = await axios.get(`${API}/lyrics/${encodeURIComponent(currentTrack.videoId)}`);
        const lyricsData = response.data;
        const youtubeLyrics = typeof lyricsData === "string" ? lyricsData : lyricsData?.lyrics || lyricsData?.syncedLyrics;
        const parsed = Array.isArray(youtubeLyrics)
          ? youtubeLyrics
              .map((line) => ({ time: Number(line.start_time) / 1000, text: line.text || "" }))
              .filter((line) => Number.isFinite(line.time) && line.text)
              .sort((a, b) => a.time - b.time)
          : typeof youtubeLyrics === "string" && youtubeLyrics.trim() && !lyricsData?.error
            ? parseLyrics(youtubeLyrics)
            : [];
        if (parsed.length && active) {
          setLyrics(parsed);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Gagal mengambil lirik dari YouTube Music:", err);
      }
      try {
        const response = await axios.get("https://lrclib.net/api/get", {
          params: {
            track_name: currentTrack.title,
            artist_name: currentTrack.artists?.[0]?.name || currentTrack.author?.name || "",
          },
        });
        const text = response.data?.syncedLyrics || response.data?.plainLyrics;
        if (active && typeof text === "string") setLyrics(parseLyrics(text));
      } catch (err) {
        console.error("Gagal mengambil lirik:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchLyrics();
    return () => { active = false; };
  }, [currentTrack?.videoId, currentTrack?.title, currentTrack?.artists, currentTrack?.author]);

  const activeIndex = lyrics.reduce((lastActiveIndex, line, index) => (
    Number.isFinite(line.time) && currentTime >= line.time ? index : lastActiveIndex
  ), -1);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIndex]);

  // Hitung riwayat lagu sebelumnya dan lagu berikutnya
  const currentIndex = activeList?.findIndex((t) => t.videoId === currentTrack?.videoId) ?? -1;
  const prevList = activeList && currentIndex > 0 ? activeList.slice(0, currentIndex) : [];
  const nextList = activeList && currentIndex !== -1 ? activeList.slice(currentIndex + 1) : [];
  const displayNext =
    nextList.length > 0
      ? nextList
      : suggestedNext.videoId === currentTrack?.videoId
        ? suggestedNext.tracks
        : [];

  useEffect(() => {
    let isCurrentTrack = true;

    const fetchWatchNext = async () => {
      if (!currentTrack?.videoId) return;

      try {
        const res = await axios.get(`${API}/watch/${encodeURIComponent(currentTrack.videoId)}`);
        if (isCurrentTrack && Array.isArray(res.data) && res.data.length > 0) {
          setSuggestedNext({ videoId: currentTrack.videoId, tracks: res.data.slice(1) });
        }
      } catch (err) {
        if (isCurrentTrack) console.error(err);
      }
    };

    if (nextList.length === 0) {
      fetchWatchNext();
    }

    return () => {
      isCurrentTrack = false;
    };
  }, [currentTrack?.videoId, nextList.length]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "linear-gradient(180deg, #400704 0%, #150201 100%)",
        zIndex: 90,
        display: "flex",
        color: "#fff",
        boxSizing: "border-box",
      }}
    >
      {/* SISI KIRI: Area Lirik Utama */}
      <div style={{ flex: 1, height: "100%", overflowY: "auto", padding: "80px 60px 140px 80px", boxSizing: "border-box" }}>
        {loading ? (
          <p style={{ fontSize: "1.5rem", opacity: 0.5 }}>Memuat lirik...</p>
        ) : lyrics.length > 0 ? (
          lyrics.map((line, index) => {
            const isActive = index === activeIndex;
            return (
              <p
                key={index}
                ref={isActive ? activeRef : null}
                style={{
                  fontSize: isActive ? "2.6rem" : "1.9rem",
                  fontWeight: "bold",
                  lineHeight: "1.4",
                  color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.3)",
                  transition: "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                  margin: "24px 0",
                  cursor: "pointer",
                }}
              >
                {line.text}
              </p>
            );
          })
        ) : (
          <p style={{ fontSize: "1.6rem", opacity: 0.4 }}>Lirik synced tidak tersedia untuk lagu ini.</p>
        )}
      </div>

      {/* SISI KANAN: Sidebar Antrean & Riwayat Lagu */}
      <div
        style={{
          width: "360px",
          background: "rgba(0, 0, 0, 0.45)",
          height: "100%",
          padding: "24px 20px 140px 20px",
          boxSizing: "border-box",
          overflowY: "auto",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Header Bar Sidebar (Tombol Kontrol Rapi & Tidak Saling Tumpuk) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "12px" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: "bold", color: "#b3b3b3", letterSpacing: "1px" }}>ANTREAN PUTAR</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={toggleFullscreen}
              style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: "32px", height: "32px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              title={isFullscreen ? "Keluar Fullscreen" : "Masuk Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: "32px", height: "32px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              title="Tutup Lirik"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 1. Lagu Sebelumnya (Sebelumnya Diputar) */}
        {prevList.length > 0 && (
          <div>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "0.8rem", color: "#b3b3b3", textTransform: "uppercase" }}>Sebelumnya</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {prevList.map((track, idx) => (
                <div key={track.videoId || idx} onClick={() => onSelectTrack(track)} style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", opacity: 0.5, padding: "4px", borderRadius: "4px" }}>
                  <img src={track.thumbnails?.[0]?.url} alt="" width="36" height="36" style={{ borderRadius: "4px", objectFit: "cover" }} />
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: "500", fontSize: "0.8rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</div>
                    <div style={{ fontSize: "0.7rem", color: "#b3b3b3" }}>{track.artists?.[0]?.name || track.author?.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. Sedang Diputar */}
        <div>
          <h4 style={{ margin: "0 0 12px 0", fontSize: "0.8rem", color: "#1db954", textTransform: "uppercase" }}>Sedang Diputar</h4>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "rgba(255,255,255,0.08)", padding: "10px", borderRadius: "6px" }}>
            <img src={currentTrack?.thumbnails?.[0]?.url} alt="" width="44" height="44" style={{ borderRadius: "4px", objectFit: "cover" }} />
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontWeight: "bold", color: "#1db954", fontSize: "0.85rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentTrack?.title}</div>
              <div style={{ fontSize: "0.75rem", color: "#b3b3b3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentTrack?.artists?.[0]?.name || currentTrack?.author?.name}</div>
            </div>
          </div>
        </div>

        {/* 3. Lagu Selanjutnya (Berikutnya) */}
        {displayNext.length > 0 && (
          <div>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "0.8rem", color: "#b3b3b3", textTransform: "uppercase" }}>Berikutnya</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {displayNext.map((track, idx) => (
                <div
                  key={track.videoId || idx}
                  onClick={() => onSelectTrack(track)}
                  style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", padding: "6px", borderRadius: "4px", transition: "background 0.2s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <img src={track.thumbnails?.[0]?.url} alt="" width="38" height="38" style={{ borderRadius: "4px", objectFit: "cover" }} />
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontWeight: "500", fontSize: "0.8rem", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</div>
                    <div style={{ fontSize: "0.7rem", color: "#b3b3b3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.artists?.[0]?.name || track.author?.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
