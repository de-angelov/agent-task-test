import nodemailer from "nodemailer";

import type { EmailSender } from "../auth/auth.server";

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

export function readSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  return {
    host: env.SMTP_HOST ?? "relay1.dataart.com",
    port: Number(env.SMTP_PORT ?? "25"),
    secure: env.SMTP_SECURE === "true",
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM ?? "no-reply@example.com",
  };
}

export function createSmtpEmailSender(config = readSmtpConfig()): EmailSender {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth:
      config.user !== undefined
        ? { user: config.user, pass: config.password ?? "" }
        : undefined,
  });

  return {
    async sendVerificationEmail({ email, verificationUrl }) {
      await transporter.sendMail({
        from: config.from,
        to: email,
        subject: "Verify your email address",
        text: `Verify your email address: ${verificationUrl}`,
      });
    },
  };
}

export function getAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.APP_BASE_URL ?? "http://localhost:5173";
}
