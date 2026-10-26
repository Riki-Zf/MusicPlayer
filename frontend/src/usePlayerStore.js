import { create } from "zustand";

export const usePlayerStore = create((set) => ({
  currentTrack: null,
  streamUrl: null,
  isPlaying: false,
  isLoading: false,

  setCurrentTrack: (track) => set({ currentTrack: track }),
  setStreamUrl: (url) => set({ streamUrl: url }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setIsLoading: (isLoading) => set({ isLoading }),
}));
