import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { ConfigurationError } from "../http/errors.js";

type VerificationEmailInput = {
  displayName: string;
  email: string;
  token: string;
};

let transporter: nodemailer.Transporter | undefined;

export function assertTransactionalEmailConfigured(): void {
  if (env.isProduction && !env.SMTP_URL) {
    throw new ConfigurationError("SMTP_URL is required to send verification emails in production");
  }
}

export function buildEmailVerificationUrl(token: string): string {
  const url = new URL("/auth/verify-email", env.APP_PUBLIC_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function sendEmailVerification(input: VerificationEmailInput): Promise<{ verificationUrl: string }> {
  assertTransactionalEmailConfigured();

  const verificationUrl = buildEmailVerificationUrl(input.token);
  const subject = "Confirmez votre email GuildOps";
  const text = [
    `Bonjour ${input.displayName},`,
    "",
    "Confirmez votre adresse email pour activer votre compte GuildOps.",
    verificationUrl,
    "",
    `Ce lien expire dans ${env.EMAIL_VERIFICATION_TTL_HOURS} heure(s).`,
    "Si vous n'avez pas cree de compte GuildOps, ignorez cet email."
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#102027">
      <h1 style="font-size:20px">Confirmez votre email GuildOps</h1>
      <p>Bonjour ${escapeHtml(input.displayName)},</p>
      <p>Confirmez votre adresse email pour activer votre compte GuildOps.</p>
      <p>
        <a href="${escapeHtml(verificationUrl)}" style="display:inline-block;padding:10px 14px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px">
          Confirmer mon email
        </a>
      </p>
      <p>Ce lien expire dans ${env.EMAIL_VERIFICATION_TTL_HOURS} heure(s).</p>
      <p style="color:#64748b">Si vous n'avez pas cree de compte GuildOps, ignorez cet email.</p>
    </div>
  `;

  await sendMail({
    html,
    subject,
    text,
    to: input.email
  });

  return { verificationUrl };
}

async function sendMail(message: { html: string; subject: string; text: string; to: string }): Promise<void> {
  if (!env.SMTP_URL) {
    console.info(`[email:dev] ${message.subject}\nTo: ${message.to}\n\n${message.text}`);
    return;
  }

  transporter ??= nodemailer.createTransport(env.SMTP_URL);

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    html: message.html,
    subject: message.subject,
    text: message.text,
    to: message.to
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
