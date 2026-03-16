import { createServer } from "http";
import app from "./app.js";
import { initWebSocket } from "./lib/websocket.js";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const httpServer = createServer(app);
initWebSocket(httpServer);

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
