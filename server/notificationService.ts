import nodemailer from 'nodemailer';
import type { CompanyAsset, Employee } from '../src/types/index.js';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface WhatsAppPayload {
  toPhone: string;
  message: string;
}

export interface ChannelDispatchResult {
  ok: boolean;
  channel: 'EMAIL' | 'WHATSAPP';
  provider: string;
  recipient: string;
  messageId?: string;
  statusCode?: number;
  error?: string;
  retryable: boolean;
}

export interface NotificationConfigStatus {
  emailConfigured: boolean;
  emailProvider: 'SMTP' | 'RESEND' | 'UNCONFIGURED';
  whatsappConfigured: boolean;
  whatsappProvider: 'META_CLOUD_API' | 'TWILIO' | 'UNCONFIGURED';
  missingCredentials: string[];
}

export function normalizeE164Phone(rawPhone: string): string {
  const trimmed = (rawPhone || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    const defaultCountryCode = (process.env.DEFAULT_PHONE_COUNTRY_CODE || '+91').replace(/\D/g, '') || '91';
    return `+${defaultCountryCode}${digits}`;
  }
  return `+${digits}`;
}

export function getNotificationConfigStatus(): NotificationConfigStatus {
  const hasSmtp = Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const emailProvider: NotificationConfigStatus['emailProvider'] = hasSmtp
    ? 'SMTP'
    : hasResend
    ? 'RESEND'
    : 'UNCONFIGURED';

  const hasMetaWhatsApp = Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  );
  const hasTwilioWhatsApp = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM
  );
  const whatsappProvider: NotificationConfigStatus['whatsappProvider'] = hasMetaWhatsApp
    ? 'META_CLOUD_API'
    : hasTwilioWhatsApp
    ? 'TWILIO'
    : 'UNCONFIGURED';

  const missingCredentials: string[] = [];
  if (emailProvider === 'UNCONFIGURED') {
    missingCredentials.push(
      'Email API: Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM (or RESEND_API_KEY + EMAIL_FROM)'
    );
  }
  if (whatsappProvider === 'UNCONFIGURED') {
    missingCredentials.push(
      'WhatsApp API: Set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID (Meta Cloud API) or TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM (Twilio)'
    );
  }

  return {
    emailConfigured: emailProvider !== 'UNCONFIGURED',
    emailProvider,
    whatsappConfigured: whatsappProvider !== 'UNCONFIGURED',
    whatsappProvider,
    missingCredentials,
  };
}

export async function sendEmailNotification(payload: EmailPayload): Promise<ChannelDispatchResult> {
  const recipient = (payload.to || '').trim();
  if (!recipient || !recipient.includes('@')) {
    return {
      ok: false,
      channel: 'EMAIL',
      provider: 'VALIDATION',
      recipient,
      error: 'Invalid or missing recipient email address.',
      retryable: false,
    };
  }

  const fromAddress =
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    '';

  // Option 1: SMTP via Nodemailer
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const port = Number(process.env.SMTP_PORT || 587);
      const secure =
        process.env.SMTP_SECURE === 'true' || port === 465;

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: fromAddress || process.env.SMTP_USER,
        to: recipient,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        attachments: payload.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      });

      return {
        ok: true,
        channel: 'EMAIL',
        provider: 'SMTP',
        recipient,
        messageId: info.messageId,
        statusCode: 250,
        retryable: false,
      };
    } catch (err: any) {
      return {
        ok: false,
        channel: 'EMAIL',
        provider: 'SMTP',
        recipient,
        error: err?.message || 'SMTP email delivery failed.',
        retryable: true,
      };
    }
  }

  // Option 2: Resend REST API
  if (process.env.RESEND_API_KEY) {
    if (!fromAddress) {
      return {
        ok: false,
        channel: 'EMAIL',
        provider: 'RESEND',
        recipient,
        error: 'EMAIL_FROM environment variable is required when using RESEND_API_KEY.',
        retryable: false,
      };
    }

    try {
      const body: Record<string, unknown> = {
        from: fromAddress,
        to: [recipient],
        subject: payload.subject,
        text: payload.text,
      };
      if (payload.html) {
        body.html = payload.html;
      }
      if (payload.attachments && payload.attachments.length > 0) {
        body.attachments = payload.attachments.map((att) => ({
          filename: att.filename,
          content: att.content.toString('base64'),
        }));
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const respJson = (await response.json().catch(() => ({}))) as Record<string, any>;
      if (!response.ok) {
        return {
          ok: false,
          channel: 'EMAIL',
          provider: 'RESEND',
          recipient,
          statusCode: response.status,
          error: respJson?.message || respJson?.error || `Resend API HTTP ${response.status}`,
          retryable: response.status >= 500 || response.status === 429,
        };
      }

      return {
        ok: true,
        channel: 'EMAIL',
        provider: 'RESEND',
        recipient,
        messageId: respJson?.id,
        statusCode: response.status,
        retryable: false,
      };
    } catch (err: any) {
      return {
        ok: false,
        channel: 'EMAIL',
        provider: 'RESEND',
        recipient,
        error: err?.message || 'Resend API network error.',
        retryable: true,
      };
    }
  }

  return {
    ok: false,
    channel: 'EMAIL',
    provider: 'UNCONFIGURED',
    recipient,
    error:
      'Email provider credentials are not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM or RESEND_API_KEY + EMAIL_FROM in environment variables.',
    retryable: true,
  };
}

export async function sendWhatsAppNotification(
  payload: WhatsAppPayload
): Promise<ChannelDispatchResult> {
  const normalizedPhone = normalizeE164Phone(payload.toPhone);
  if (!normalizedPhone || normalizedPhone.length < 10) {
    return {
      ok: false,
      channel: 'WHATSAPP',
      provider: 'VALIDATION',
      recipient: payload.toPhone || '',
      error: 'Invalid or missing recipient phone number for WhatsApp.',
      retryable: false,
    };
  }

  // Option 1: Meta WhatsApp Cloud API
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const graphRecipient = normalizedPhone.replace(/^\+/, '');
    const url = `https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: graphRecipient,
          type: 'text',
          text: {
            preview_url: false,
            body: payload.message,
          },
        }),
      });

      const respJson = (await response.json().catch(() => ({}))) as Record<string, any>;
      if (!response.ok) {
        const apiErr =
          respJson?.error?.message ||
          `Meta WhatsApp Cloud API HTTP ${response.status}`;
        return {
          ok: false,
          channel: 'WHATSAPP',
          provider: 'META_CLOUD_API',
          recipient: normalizedPhone,
          statusCode: response.status,
          error: apiErr,
          retryable: response.status >= 500 || response.status === 429,
        };
      }

      const msgId = respJson?.messages?.[0]?.id;
      return {
        ok: true,
        channel: 'WHATSAPP',
        provider: 'META_CLOUD_API',
        recipient: normalizedPhone,
        messageId: msgId,
        statusCode: response.status,
        retryable: false,
      };
    } catch (err: any) {
      return {
        ok: false,
        channel: 'WHATSAPP',
        provider: 'META_CLOUD_API',
        recipient: normalizedPhone,
        error: err?.message || 'Meta WhatsApp Cloud API network error.',
        retryable: true,
      };
    }
  }

  // Option 2: Twilio WhatsApp API
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM
  ) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const rawFrom = process.env.TWILIO_WHATSAPP_FROM.trim();
    const fromWhatsApp = rawFrom.startsWith('whatsapp:')
      ? rawFrom
      : `whatsapp:${normalizeE164Phone(rawFrom)}`;
    const toWhatsApp = `whatsapp:${normalizedPhone}`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;

    try {
      const formBody = new URLSearchParams({
        From: fromWhatsApp,
        To: toWhatsApp,
        Body: payload.message,
      });

      const basicAuth = Buffer.from(`${sid}:${token}`).toString('base64');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString(),
      });

      const respJson = (await response.json().catch(() => ({}))) as Record<string, any>;
      if (!response.ok) {
        return {
          ok: false,
          channel: 'WHATSAPP',
          provider: 'TWILIO',
          recipient: normalizedPhone,
          statusCode: response.status,
          error: respJson?.message || `Twilio WhatsApp API HTTP ${response.status}`,
          retryable: response.status >= 500 || response.status === 429,
        };
      }

      return {
        ok: true,
        channel: 'WHATSAPP',
        provider: 'TWILIO',
        recipient: normalizedPhone,
        messageId: respJson?.sid,
        statusCode: response.status,
        retryable: false,
      };
    } catch (err: any) {
      return {
        ok: false,
        channel: 'WHATSAPP',
        provider: 'TWILIO',
        recipient: normalizedPhone,
        error: err?.message || 'Twilio WhatsApp API network error.',
        retryable: true,
      };
    }
  }

  return {
    ok: false,
    channel: 'WHATSAPP',
    provider: 'UNCONFIGURED',
    recipient: normalizedPhone,
    error:
      'WhatsApp provider credentials are not configured. Set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID (Meta Cloud API) or TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM (Twilio) in environment variables.',
    retryable: true,
  };
}

export function buildAssetReturnReminderMessages(
  person: Employee,
  unreturnedAssets: CompanyAsset[],
  endDateFormatted: string
): { subject: string; emailText: string; emailHtml: string; whatsappText: string } {
  const roleLabel =
    person.employmentStatus === 'Intern' || Boolean(person.internshipCompletionDate)
      ? 'internship'
      : 'employment';
  const subject = `Action Required: Company Asset Return Reminder (Deadline: ${endDateFormatted}) — White Collar Realty`;

  const assetBulletsText = unreturnedAssets
    .map(
      (asset, idx) =>
        `${idx + 1}. ${asset.name} (${asset.type}) — Asset Tag: ${asset.assetTag}, Serial: ${
          asset.serialNumber || 'N/A'
        }, Issued On: ${asset.issueDate || 'N/A'}`
    )
    .join('\n');

  const assetRowsHtml = unreturnedAssets
    .map(
      (asset) => `
      <tr>
        <td style="padding:8px 12px;border:1px solid #cbd5e1;font-weight:600;">${asset.assetTag}</td>
        <td style="padding:8px 12px;border:1px solid #cbd5e1;">${asset.name} (${asset.type})</td>
        <td style="padding:8px 12px;border:1px solid #cbd5e1;">${asset.serialNumber || 'N/A'}</td>
        <td style="padding:8px 12px;border:1px solid #cbd5e1;">${asset.issueDate || 'N/A'}</td>
      </tr>`
    )
    .join('');

  const emailText = [
    `Dear ${person.fullName},`,
    '',
    `Your ${roleLabel} end date at White Collar Realty is approaching in 2 days on ${endDateFormatted}.`,
    `Our records show the following company asset(s) remain issued to you and must be returned on or before ${endDateFormatted}:`,
    '',
    assetBulletsText,
    '',
    `Return Deadline: ${endDateFormatted}`,
    `Return Location: HR & IT Handover Desk, White Collar Realty HQ`,
    '',
    `Please hand over all listed hardware and accessories to HR/IT and ensure your handover acknowledgment is recorded.`,
    '',
    `Warm regards,`,
    `HR Operations`,
    `White Collar Realty`,
  ].join('\n');

  const emailHtml = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:640px;">
      <h2 style="color:#0f172a;margin-bottom:8px;">Company Asset Return Reminder</h2>
      <p>Dear <strong>${person.fullName}</strong>,</p>
      <p>Your ${roleLabel} end date at <strong>White Collar Realty</strong> is approaching in <strong>2 days</strong> on <strong>${endDateFormatted}</strong>.</p>
      <p>Our records indicate that the following company asset(s) are currently unreturned and must be handed over on or before <strong>${endDateFormatted}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;">
        <thead>
          <tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:8px 12px;border:1px solid #cbd5e1;">Asset Tag</th>
            <th style="padding:8px 12px;border:1px solid #cbd5e1;">Asset</th>
            <th style="padding:8px 12px;border:1px solid #cbd5e1;">Serial No.</th>
            <th style="padding:8px 12px;border:1px solid #cbd5e1;">Issued On</th>
          </tr>
        </thead>
        <tbody>${assetRowsHtml}</tbody>
      </table>
      <p style="background:#fffbeb;border:1px solid #fde68a;padding:10px 14px;border-radius:6px;">
        <strong>Return Deadline:</strong> ${endDateFormatted}<br/>
        <strong>Handover Desk:</strong> HR &amp; IT Operations, White Collar Realty
      </p>
      <p>Warm regards,<br/><strong>HR Operations — White Collar Realty</strong></p>
    </div>
  `;

  const whatsappAssets = unreturnedAssets
    .map(
      (asset) =>
        `• ${asset.name} (${asset.assetTag} | SN: ${asset.serialNumber || 'N/A'})`
    )
    .join('\n');

  const whatsappText = [
    `Hello ${person.fullName},`,
    `This is an automated reminder from *White Collar Realty HR*. Your ${roleLabel} end date is in 2 days (*${endDateFormatted}*).`,
    '',
    `Please return the following issued company asset(s) on or before *${endDateFormatted}*:`,
    whatsappAssets,
    '',
    `Return Deadline: *${endDateFormatted}*`,
    `Kindly coordinate with HR Operations for asset inspection and handover clearance.`,
  ].join('\n');

  return { subject, emailText, emailHtml, whatsappText };
}
