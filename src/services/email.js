import nodemailer from 'nodemailer';

import { env } from '../config/env.js';

const testOutbox = [];
let smtpTransporter;

function buildLink(pathname, token) {
  return `${env.appBaseUrl.replace(/\/$/, '')}${pathname}?token=${encodeURIComponent(token)}`;
}

function messageFor(kind, token) {
  if (kind === 'verification') {
    return {
      subject: 'Verifikasi email ManajemenTugas.id',
      text: `Buka tautan berikut untuk memverifikasi email Anda: ${buildLink('/verify-email', token)}`,
    };
  }
  return {
    subject: 'Reset password ManajemenTugas.id',
    text: `Buka tautan berikut untuk mengatur ulang password Anda: ${buildLink('/reset-password', token)}`,
  };
}

export async function sendAuthEmail({ kind, to, token }) {
  const message = messageFor(kind, token);

  if (env.emailMode === 'disabled') return { status: 'not_configured' };
  if (env.emailMode === 'simulation') return { status: 'simulation' };
  if (env.emailMode === 'test') {
    testOutbox.push({ kind, to, token });
    return { status: 'test_capture' };
  }

  if (!env.smtpHost || !env.smtpUser || !env.smtpPassword || !env.emailFrom) {
    return { status: 'not_configured' };
  }

  smtpTransporter ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    requireTLS: env.smtpPort !== 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: { user: env.smtpUser, pass: env.smtpPassword },
  });

  await smtpTransporter.sendMail({ from: env.emailFrom, to, subject: message.subject, text: message.text });
  return { status: 'sent' };
}

export function getTestOutbox() {
  return testOutbox;
}

export function clearTestOutbox() {
  testOutbox.length = 0;
}
