"use client";

/**
 * Niches disponibles — chargées dynamiquement depuis le backend
 * (GET /api/settings/niches), avec fallback sur les défauts si l'API est injoignable.
 */
import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

export const DEFAULT_NICHES: string[] = [
  "Cuisine",
  "Nettoyage",
  "Barber",
  "Immobilier",
  "Artisanat",
  "Aviation / Pilotage",
];

export function useNiches() {
  return useQuery({
    queryKey: ["niches"],
    queryFn: async () => {
      try {
        const res = await api.getNiches();
        return res.niches.length > 0 ? res.niches : DEFAULT_NICHES;
      } catch (err) {
        console.error("getNiches", err);
        return DEFAULT_NICHES;
      }
    },
    placeholderData: DEFAULT_NICHES,
    staleTime: 60_000,
  });
}
