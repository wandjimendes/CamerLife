import http from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { env } from "./services/env.ts";
import { TownRoom } from "./rooms/TownRoom.ts";
import { HouseRoom } from "./rooms/HouseRoom.ts";

const app = express();
app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ name: "Cameroon Life game server", phase: 1, ok: true });
});
app.get("/health", (_req, res) => res.send("ok"));

if (env.monitorPassword) {
  app.use(
    "/colyseus",
    (req, res, next) => {
      const header = req.headers.authorization ?? "";
      const [, encoded] = header.split(" ");
      const decoded = encoded ? Buffer.from(encoded, "base64").toString() : "";
      if (decoded === `admin:${env.monitorPassword}`) return next();
      res.set("WWW-Authenticate", 'Basic realm="colyseus"').status(401).send("Unauthorized");
    },
    monitor(),
  );
}

const server = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server, pingInterval: 5000, pingMaxRetries: 3 }),
});

// town_{townId}: one shared room per town
gameServer.define("town", TownRoom).filterBy(["townId"]);
// house_{unitId}: one instanced room per unit
gameServer.define("house", HouseRoom).filterBy(["unitId"]);

gameServer.listen(env.port).then(() => {
  console.log(`Cameroon Life server listening on :${env.port}`);
  if (!env.supabaseUrl) console.warn("SUPABASE_URL missing - copy .env.example to .env");
});
