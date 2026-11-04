import { createServer } from "node:http";
import { appointmentEvent, decideNotification, verifySignature } from "./appointment-workflow.ts";
import { listWebhookDeliveries, registerAppointmentWebhook, subscribeAppointmentQueue } from "./infrai-client.ts";

const secret = process.env.WEBHOOK_SECRET;
const queue = process.env.APPOINTMENT_QUEUE ?? "appointment-events";

if (!secret) throw new Error("WEBHOOK_SECRET is required");

const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/platform/appointment-events") {
    response.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    const signature = request.headers["x-infrai-signature"];
    if (typeof signature !== "string" || !verifySignature(raw, signature, secret)) {
      response.writeHead(401).end("signature rejected");
      return;
    }
    const parsed = appointmentEvent.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      response.writeHead(400).end("invalid appointment event");
      return;
    }
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify(decideNotification(parsed.data)));
  });
});

async function configure() {
  if (!secret) throw new Error("WEBHOOK_SECRET is required");
  const webhookUrl = process.env.PUBLIC_WEBHOOK_URL ?? "http://127.0.0.1:3000/platform/appointment-events";
  const registered = await registerAppointmentWebhook(webhookUrl, secret);
  if (!registered.webhook_id) throw new Error("Webhook registration did not return webhook_id");
  await subscribeAppointmentQueue(queue, webhookUrl);
  await listWebhookDeliveries(registered.webhook_id);
  console.log(`registered webhook ${registered.webhook_id} and subscribed ${queue}`);
}

if (process.argv[1]?.endsWith("main.ts")) {
  if (process.argv[2] === "configure") await configure();
  else server.listen(3000, () => console.log("appointment receiver listening on 3000"));
}
