import { useEffect, useRef, useState } from "react";
import { usePlayerStore } from "./usePlayerStore";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, FileText } from "lucide-react";
import LyricsModal from "./LyricsModal";

export default function PlayerBar({ onNext, onPrev, activeList, onPlaySong }) {
  const { currentTrack, streamUrl, isPlaying, setIsPlaying } = usePlayerStore();
  const audioRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  // Auto play ketika streamUrl berubah
  useEffect(() => {
    if (streamUrl && audioRef.current) {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [streamUrl, setIsPlaying]);

  // Handle Play / Pause
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Handle Seek Time (Progress Bar)
  const handleSeek = (e) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Handle Volume Change
  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
      setIsMuted(newVol === 0);
    }
  };

  // Handle Mute / Unmute
  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  // Format detik ke format menit:detik (contoh 03:45)
  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  if (!currentTrack) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          width: "100%",
          background: "#181818",
          color: "#fff",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxSizing: "border-box",
          borderTop: "1px solid #282828",
          zIndex: 100,
        }}
      >
        <audio
          ref={audioRef}
          src={streamUrl}
          onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.target.duration)}
          onEnded={() => {
            setIsPlaying(false);
            if (onNext) onNext();
          }}
        />

        {/* 1. Informasi Lagu (Kiri) */}
        <div style={{ display: "flex", alignItems: "center", gap: "15px", width: "30%" }}>
          {currentTrack.thumbnails?.[0]?.url && <img src={currentTrack.thumbnails[0].url} alt={currentTrack.title} width="56" height="56" style={{ borderRadius: "4px", objectFit: "cover" }} />}
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontWeight: "bold", fontSize: "0.95rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentTrack.title}</div>
            <div style={{ fontSize: "0.8rem", color: "#b3b3b3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentTrack.artists?.[0]?.name}</div>
          </div>
        </div>

        {/* 2. Controls & Seek Bar (Tengah) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "40%" }}>
          {/* Tombol Playback */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <button onClick={onPrev} style={{ background: "none", border: "none", color: "#b3b3b3", cursor: "pointer" }}>
              <SkipBack size={20} />
            </button>

            <button onClick={togglePlay} style={{ background: "#fff", border: "none", borderRadius: "50%", padding: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isPlaying ? <Pause size={18} color="#000" /> : <Play size={18} color="#000" style={{ marginLeft: "2px" }} />}
            </button>

            <button onClick={onNext} style={{ background: "none", border: "none", color: "#b3b3b3", cursor: "pointer" }}>
              <SkipForward size={20} />
            </button>
          </div>

          {/* Progress Bar (Waktu & Range Slider) */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", fontSize: "0.75rem", color: "#b3b3b3" }}>
            <span>{formatTime(currentTime)}</span>
            <input type="range" min="0" max={duration || 0} value={currentTime} onChange={handleSeek} style={{ flex: 1, accentColor: "#1db954", cursor: "pointer", height: "4px" }} />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* 3. Extra Controls & Volume (Kanan) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "15px", width: "30%" }}>
          {/* Tombol Lirik */}
          <button onClick={() => setShowLyrics(true)} style={{ background: "none", border: "none", color: showLyrics ? "#1db954" : "#b3b3b3", cursor: "pointer" }}>
            <FileText size={20} />
          </button>

          {/* Mute & Volume Slider */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button onClick={toggleMute} style={{ background: "none", border: "none", color: "#b3b3b3", cursor: "pointer" }}>
              {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={handleVolumeChange} style={{ width: "80px", accentColor: "#1db954", cursor: "pointer", height: "4px" }} />
          </div>
        </div>
      </div>

      {/* Modal Lirik */}
      {showLyrics && (
        <LyricsModal
          currentTrack={currentTrack}
          currentTime={currentTime}
          activeList={activeList || []}
          onSelectTrack={(track) => {
            if (onPlaySong) onPlaySong(track);
          }}
          onClose={() => setShowLyrics(false)}
        />
      )}
    </>
  );
}
