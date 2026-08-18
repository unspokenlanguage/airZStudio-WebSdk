import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Hosted separately from the controller; talks to http://<controller>:3467/api/v1.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5180 },
});
