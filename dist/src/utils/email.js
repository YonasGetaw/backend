import nodemailer from "nodemailer";
import { env } from "../config/env.js";
export const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
});
export async function sendPasswordResetEmail(params) {
    await transporter.sendMail({
        from: `${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`,
        to: params.to,
        subject: "Reset your Vestoria password",
        html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Password Reset</h2>
        <p>Click the link below to reset your password:</p>
        <p><a href="${params.resetUrl}">${params.resetUrl}</a></p>
        <p>If you didn\'t request this, you can ignore this email.</p>
      </div>
    `
    });
}
