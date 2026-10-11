import type { Role } from "@/config/rules";

export interface Player {
  id: string;
  name: string;
  team: string; // the real-world side the player plays for, e.g. "India"
  role: Role;
  credits: number;
}

export interface Team {
  players: Player[];
  captainId?: string;
  viceCaptainId?: string;
}
