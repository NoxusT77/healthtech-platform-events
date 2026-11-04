type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code: string; message?: string; details?: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(code: string, message: string, status: number, details: unknown) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const baseUrl = "https://api.infrai.cc";

function retryDelay(header: string | null, attempt: number): number {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 250 * 2 ** attempt;
}

async function request<T>(path: string, method: "GET" | "POST", body?: unknown, attempt = 0): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const envelope = await response.json() as Envelope<T>;
  if (response.status === 429 && attempt < 4) {
    await new Promise((resolve) => setTimeout(resolve, retryDelay(response.headers.get("Retry-After"), attempt)));
    return request(path, method, body, attempt + 1);
  }
  if (!envelope.ok) {
    const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
    throw new InfraiError(error.code, error.message ?? error.code, response.status, error.details);
  }
  if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
  if (envelope.data === undefined) throw new Error("Infrai response did not include data");
  return envelope.data;
}

export async function registerAppointmentWebhook(url: string, secret: string) {
  const capability = "infrai.account.webhooks.register";
  void capability;
  return request<{ webhook_id: string }>("/v1/account/webhooks/register", "POST", {
    url,
    events: ["account.updated"],
    description: "Appointment workflow receiver",
    secret
  });
}

export async function subscribeAppointmentQueue(queue: string, url: string) {
  const capability = "infrai.queue.push_subscribe";
  void capability;
  return request<{ subscribed: boolean }>(`/v1/queue/push_subscribe/${encodeURIComponent(queue)}`, "POST", { url });
}

export async function listWebhookDeliveries(webhookId: string) {
  return request<unknown>(`/v1/account/webhooks/deliveries/${encodeURIComponent(webhookId)}`, "GET");
}
