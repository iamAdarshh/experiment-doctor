import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Flagsmith } from "@flagsmith/nodejs";
import { EVENTS, FLAGS } from "./experiments.js";

const apiUrl = process.env.FLAGSMITH_SDK_API_URL || "https://edge.api.flagsmith.com/api/v1/";
const flagsmith = new Flagsmith({
  environmentKey: process.env.FLAGSMITH_SERVER_SIDE_KEY,
  apiUrl,
  enableEvents: true,
  eventProcessorConfig: process.env.FLAGSMITH_EVENTS_API_URL ? { eventsApiUrl: process.env.FLAGSMITH_EVENTS_API_URL } : undefined,
});

function visitor(req) {
  const m = /visitor=([\w-]+)/.exec(req.headers.cookie || "");
  return m ? m[1] : null;
}

async function buttonFor(user) {
  const flag = await flagsmith.getExperimentFlag(FLAGS.checkoutButton, user.id);
  const primary = flag.variant === "buy_now";
  return { primary, label: primary ? "Buy now" : "Checkout" };
}

function checkout(user, total) {
  const amount = Math.round(total * 100) / 100;
  flagsmith.trackEvent(EVENTS.checkoutCompleted, { identifier: user.id, value: amount });
}

const server = createServer(async (req, res) => {
  const id = visitor(req) || randomUUID();
  const user = { id, email: `${id}@example.test` };
  res.setHeader("Set-Cookie", `visitor=${id}; Path=/; SameSite=Lax`);
  if (req.url === "/api/button") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(await buttonFor(user)));
  } else if (req.url === "/api/checkout" && req.method === "POST") {
    checkout(user, 42);
    res.end("ok");
  } else if (req.url === "/app.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(await readFile(new URL("../public/app.js", import.meta.url)));
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(await readFile(new URL("../public/index.html", import.meta.url)));
  }
});

server.listen(Number(process.env.PORT || 3005), () => console.log(`demo-shop on http://localhost:${process.env.PORT || 3005}`));
process.on("SIGTERM", async () => {
  await flagsmith.flushEvents();
  process.exit(0);
});
