import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const appointmentEvent = z.object({
  type: z.literal("account.updated"),
  appointment_id: z.string().min(1),
  patient_first_name: z.string().min(1),
  status: z.enum(["scheduled", "confirmed", "cancelled"]),
  starts_at: z.string().min(1)
});

export type AppointmentEvent = z.infer<typeof appointmentEvent>;

export function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = Buffer.from(signature, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export function decideNotification(event: AppointmentEvent): { action: "send_patient_safe_notice" | "record_only"; message: string } {
  if (event.status === "cancelled") {
    return { action: "send_patient_safe_notice", message: `Appointment ${event.appointment_id} was cancelled.` };
  }
  if (event.status === "confirmed") {
    return { action: "send_patient_safe_notice", message: `Appointment confirmed for ${event.patient_first_name}.` };
  }
  return { action: "record_only", message: `Appointment ${event.appointment_id} is scheduled.` };
}
