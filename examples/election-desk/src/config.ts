// Defaults for the demo. Override the controller address to match your studio
// LAN (the port is the controller's full web server, 3467).
export const DEFAULTS = {
  baseUrl: "http://127.0.0.1:3467",
  username: "admin",
  password: "",
};

// Seed parties for the desk. Each `binding` is the exact data-binding key on the
// target playlist item's template (from GET /templates/<id> → dataBindings).
export interface Party {
  id: string;
  name: string;
  binding: string; // e.g. "Party A Votes"
  color: string;
}

export const SEED_PARTIES: Party[] = [
  { id: "a", name: "Party A", binding: "Party A Votes", color: "#6366f1" },
  { id: "b", name: "Party B", binding: "Party B Votes", color: "#ef4444" },
  { id: "c", name: "Party C", binding: "Party C Votes", color: "#10b981" },
  { id: "d", name: "Party D", binding: "Party D Votes", color: "#f59e0b" },
];

// Optional headline binding + an on-air trigger name to demo item.trigger().
export const HEADLINE_BINDING = "Headline";
export const ANIMATE_IN_TRIGGER = "Animate-In";
