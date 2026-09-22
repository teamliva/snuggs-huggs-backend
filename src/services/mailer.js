import nodemailer from "nodemailer";
import { env, mailEnabled } from "../config/env.js";

let transporter = null;

function getTransporter() {
  if (!mailEnabled) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  return transporter;
}

const escapeHtml = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

/**
 * Notifies the office that a new enquiry arrived.
 *
 * Never throws. The lead is already saved by the time this runs, and a
 * failed notification must not turn a captured lead into a 500 for the
 * family that submitted it — the record is the thing that matters. Failures
 * are logged loudly instead.
 */
export async function sendLeadNotification(lead) {
  const tx = getTransporter();

  if (!tx) {
    console.log(
      `[lead] ${lead.name} <${lead.email || "no email"}> ${lead.phone} ` +
        `— email notifications disabled (SMTP_HOST/MAIL_TO unset)`
    );
    return { sent: false, reason: "mail-disabled" };
  }

  const lines = [
    ["Name", lead.name],
    ["Phone", lead.phone],
    ["Email", lead.email || "—"],
    ["Prefers", lead.preferredContact],
    ["Care level", lead.carePlan],
    ["Message", lead.message || "—"],
    ["Received", new Date(lead.createdAt).toLocaleString("en-US")],
  ];

  try {
    await tx.sendMail({
      from: env.MAIL_FROM || env.SMTP_USER,
      to: env.MAIL_TO,
      replyTo: lead.email || undefined,
      subject: `New care enquiry — ${lead.name}`,
      text: lines.map(([k, v]) => `${k}: ${v}`).join("\n"),
      html:
        `<h2 style="font-family:system-ui,sans-serif">New care enquiry</h2>` +
        `<table style="font-family:system-ui,sans-serif;border-collapse:collapse">` +
        lines
          .map(
            ([k, v]) =>
              `<tr><td style="padding:6px 14px 6px 0;color:#6B7280">${k}</td>` +
              `<td style="padding:6px 0"><strong>${escapeHtml(v)}</strong></td></tr>`
          )
          .join("") +
        `</table>`,
    });
    return { sent: true };
  } catch (err) {
    console.error("Lead notification failed (the lead itself was saved):", err.message);
    return { sent: false, reason: err.message };
  }
}
