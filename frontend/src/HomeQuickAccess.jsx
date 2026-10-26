import { Disc3, Headphones, Mic2, Music2, Radio, Sparkles } from "lucide-react";

const shortcuts = [
  { title: "Pop Indonesia", query: "Pop Indonesia terbaru", filter: "songs", icon: Music2, color: "#d14a77" },
  { title: "Lagu populer", query: "Lagu Populer Indonesia", filter: "songs", icon: Sparkles, color: "#7a55c7" },
  { title: "Musik indie", query: "Indie Indonesia", filter: "songs", icon: Headphones, color: "#218b72" },
  { title: "Album baru", query: "Album Indonesia terbaru", filter: "albums", icon: Disc3, color: "#be7137" },
  { title: "Musik santai", query: "Chill music", filter: "songs", icon: Radio, color: "#3973a5" },
  { title: "Podcast", query: "Podcast Indonesia", filter: "podcasts", icon: Mic2, color: "#93722c" },
];

export default function HomeQuickAccess({ onPlayQuickItem }) {
  return (
    <section className="quick-access section-block">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MULAI DARI SINI</span>
          <h2>Jelajahi pilihan</h2>
        </div>
      </div>
      <div className="shortcut-grid">
        {shortcuts.map(({ title, query, filter, icon: Icon, color }) => (
          <button className="shortcut-card" key={title} type="button" onClick={() => onPlayQuickItem?.({ query, filter })}>
            <span className="shortcut-icon" style={{ background: color }}><Icon size={21} /></span>
            <span>{title}</span>
            <span className="shortcut-hint">Cari sekarang</span>
          </button>
        ))}
      </div>
    </section>
  );
}
