// Listens on argv[2], then runs the Node boot hook. `next start` listens before instrumentation.
import net from "node:net";
import { failClosed } from "../../src/instrumentation-node";

const host = process.argv[2] ?? "127.0.0.1";
const server = net.createServer();
server.on("error", () => {
  process.exit(1);
});
server.listen(0, host, () => {
  failClosed();
  server.close(() => process.exit(0));
});
