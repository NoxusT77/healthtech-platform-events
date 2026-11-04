import test from "node:test";
import assert from "node:assert/strict";
import { decideNotification } from "./appointment-workflow.ts";

test("confirmed appointment gets a patient-safe notice", () => {
  const result = decideNotification({
    type: "account.updated",
    appointment_id: "apt-42",
    patient_first_name: "Maya",
    status: "confirmed",
    starts_at: "2026-10-26T09:00:00Z"
  });
  assert.deepEqual(result, { action: "send_patient_safe_notice", message: "Appointment confirmed for Maya." });
});
