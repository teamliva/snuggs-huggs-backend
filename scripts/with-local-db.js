/**
 * Runs another script against the local development database started by
 * `npm run dev` (scripts/dev-local.js), which listens on a fixed port.
 *
 *   npm run create-admin:local
 *
 * The dev server must already be running — this connects to its database
 * rather than starting a second one, so both see the same data.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import net from "node:net";

const LOCAL_URI = "mongodb://127.0.0.1:27018/snuggs-huggs";

/** Cheap TCP check so a missing dev server gives a clear message. */
function isUp(port, host = "127.0.0.1", timeout = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

if (!(await isUp(27018))) {
  console.error(
    "\nThe local development database isn't running.\n\n" +
      "  Start it in another terminal first:\n" +
      "    cd backend && npm run dev\n\n" +
      "  Then run this command again.\n"
  );
  process.exit(1);
}

process.env.MONGODB_URI = LOCAL_URI;

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/with-local-db.js <script-path>");
  process.exit(1);
}

await import(pathToFileURL(path.resolve(target)).href);
