import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { db } from './database.ts';
import {
  sendEmailNotification,
  sendWhatsAppNotification,
  buildAssetReturnReminderMessages,
  getNotificationConfigStatus,
} from './notificationService.ts';
import type {
  AssetReturnReminderRecord,
  CompanyAsset,
  Employee,
} from '../src/types/index.ts';

let sweepTask: ScheduledTask | null = null;
let retryTask: ScheduledTask | null = null;
let lastSweepAt: string | null = null;
let lastRetryCheckAt: string | null = null;
let isSweepRunning = false;
let isRetryRunning = false;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseDateToMidnight(raw?: string): { date: Date; isoDate: string; formatted: string } | null {
  if (!raw || !raw.trim()) return null;
  const parts = raw.trim().split(/[-/]/);
  if (parts.length < 3) return null;

  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let day = parseInt(parts[2], 10);

  if (parts[0].length <= 2 && parts[2].length === 4) {
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  }

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const formatted = `${day} ${MONTH_NAMES[month - 1]} ${year}`;
  return { date, isoDate, formatted };
}

function getEffectiveEndDateString(person: Employee): string | undefined {
  return (
    person.internshipCompletionDate ||
    person.jobEndDate ||
    person.exitClearance?.actualLwd ||
    person.exitClearance?.calculatedLwd ||
    undefined
  );
}

function getUnreturnedAssetsForPerson(personId: string): CompanyAsset[] {
  return db
    .getAssets()
    .filter(
      (asset) =>
        asset.assignedEmployeeId === personId &&
        asset.status === 'In Use' &&
        !asset.returnDate
    );
}

function computeNextRetryIso(retryCount: number): string {
  // Exponential backoff: 5 min -> 15 min -> 60 min
  const delayMinutes = retryCount <= 1 ? 5 : retryCount === 2 ? 15 : 60;
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
}

export interface SweepExecutionSummary {
  referenceDate: string;
  evaluatedPeopleCount: number;
  eligibleTwoDayMatches: number;
  dispatchedOrUpdated: number;
  skippedNoUnreturnedAssets: number;
  skippedDuplicateAlreadySent: number;
  retriesProcessed: number;
  records: AssetReturnReminderRecord[];
}

export async function runAssetReturnReminderSweep(options?: {
  referenceDate?: string;
  triggeredBy?: string;
}): Promise<SweepExecutionSummary> {
  if (isSweepRunning) {
    return {
      referenceDate: options?.referenceDate || new Date().toISOString().split('T')[0],
      evaluatedPeopleCount: 0,
      eligibleTwoDayMatches: 0,
      dispatchedOrUpdated: 0,
      skippedNoUnreturnedAssets: 0,
      skippedDuplicateAlreadySent: 0,
      retriesProcessed: 0,
      records: [],
    };
  }

  isSweepRunning = true;
  try {
    const refInput = options?.referenceDate ? new Date(options.referenceDate) : new Date();
    const refMidnight = new Date(
      refInput.getFullYear(),
      refInput.getMonth(),
      refInput.getDate(),
      0,
      0,
      0,
      0
    );
    const refIso = `${refMidnight.getFullYear()}-${String(refMidnight.getMonth() + 1).padStart(2, '0')}-${String(
      refMidnight.getDate()
    ).padStart(2, '0')}`;
    lastSweepAt = new Date().toISOString();

    const maxRetries = Math.max(1, Number(process.env.NOTIFICATION_MAX_RETRIES || 3));
    const allPeople = db.getEmployees('HR');
    const touchedRecords: AssetReturnReminderRecord[] = [];

    let eligibleTwoDayMatches = 0;
    let dispatchedOrUpdated = 0;
    let skippedNoUnreturnedAssets = 0;
    let skippedDuplicateAlreadySent = 0;

    for (const person of allPeople) {
      if (person.employmentStatus === 'Ex-Employee') continue;

      const rawEnd = getEffectiveEndDateString(person);
      const parsedEnd = parseDateToMidnight(rawEnd);
      if (!parsedEnd) continue;

      const diffDays = Math.round(
        (parsedEnd.date.getTime() - refMidnight.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Requirement 5: Send reminder EXACTLY 2 days before the internship/job end date
      if (diffDays !== 2) continue;

      eligibleTwoDayMatches++;

      const unreturnedAssets = getUnreturnedAssetsForPerson(person.id);
      if (unreturnedAssets.length === 0) {
        skippedNoUnreturnedAssets++;
        continue;
      }

      const idempotencyKey = `${person.id}::${parsedEnd.isoDate}::2DAY_ASSET_RETURN`;
      const existing = db.getAssetReturnReminderByKey(idempotencyKey);

      // Prevent duplicate reminders when both Email and WhatsApp were already sent
      if (
        existing &&
        existing.emailStatus === 'SENT' &&
        existing.whatsappStatus === 'SENT'
      ) {
        skippedDuplicateAlreadySent++;
        continue;
      }

      // If already waiting on scheduled retry or permanently exhausted, skip duplicate initial sweep
      // unless manually triggered by HR/Co-Founder
      if (
        existing &&
        !options?.triggeredBy &&
        (existing.overallStatus === 'RETRY_SCHEDULED' ||
          existing.overallStatus === 'FAILED_PERMANENTLY')
      ) {
        skippedDuplicateAlreadySent++;
        continue;
      }

      const record = await dispatchChannelsForReminder(
        person,
        unreturnedAssets,
        parsedEnd.isoDate,
        parsedEnd.formatted,
        idempotencyKey,
        existing,
        maxRetries,
        options?.triggeredBy || 'Automated Cron Scheduler'
      );

      touchedRecords.push(record);
      dispatchedOrUpdated++;
    }

    const retriesProcessed = await processAssetReminderRetries();

    return {
      referenceDate: refIso,
      evaluatedPeopleCount: allPeople.length,
      eligibleTwoDayMatches,
      dispatchedOrUpdated,
      skippedNoUnreturnedAssets,
      skippedDuplicateAlreadySent,
      retriesProcessed,
      records: touchedRecords,
    };
  } finally {
    isSweepRunning = false;
  }
}

async function dispatchChannelsForReminder(
  person: Employee,
  unreturnedAssets: CompanyAsset[],
  endIsoDate: string,
  formattedEndDate: string,
  idempotencyKey: string,
  existing: AssetReturnReminderRecord | undefined,
  maxRetries: number,
  actorLabel: string
): Promise<AssetReturnReminderRecord> {
  const nowIso = new Date().toISOString();
  const attemptNumber = existing ? existing.retryCount + 1 : 1;
  const messages = buildAssetReturnReminderMessages(person, unreturnedAssets, formattedEndDate);

  let emailStatus = existing?.emailStatus || 'PENDING';
  let whatsappStatus = existing?.whatsappStatus || 'PENDING';
  let emailError = existing?.emailError;
  let whatsappError = existing?.whatsappError;
  let emailSentAt = existing?.emailSentAt;
  let whatsappSentAt = existing?.whatsappSentAt;
  let anyRetryableFailure = false;

  const reminderId =
    existing?.id || `arem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // 1. Dispatch Email if not already SENT
  if (emailStatus !== 'SENT') {
    const emailRes = await sendEmailNotification({
      to: person.email,
      subject: messages.subject,
      text: messages.emailText,
      html: messages.emailHtml,
    });

    if (emailRes.ok) {
      emailStatus = 'SENT';
      emailSentAt = new Date().toISOString();
      emailError = undefined;
    } else {
      emailStatus = 'FAILED';
      emailError = emailRes.error;
      if (emailRes.retryable) anyRetryableFailure = true;
    }

    db.addNotificationDeliveryLog({
      category: 'ASSET_RETURN_REMINDER',
      reminderId,
      personId: person.id,
      personName: person.fullName,
      channel: 'EMAIL',
      provider: emailRes.provider,
      recipient: emailRes.recipient || person.email,
      status: emailRes.ok ? 'SENT' : 'FAILED',
      attemptNumber,
      messageId: emailRes.messageId,
      statusCode: emailRes.statusCode,
      error: emailRes.error,
      summary: emailRes.ok
        ? `Sent 2-day asset return email reminder (${unreturnedAssets.length} unreturned asset(s), deadline ${endIsoDate}).`
        : `Email reminder failed (${emailRes.provider}): ${emailRes.error}`,
    });
  }

  // 2. Dispatch WhatsApp if not already SENT
  if (whatsappStatus !== 'SENT') {
    const waRes = await sendWhatsAppNotification({
      toPhone: person.phone,
      message: messages.whatsappText,
    });

    if (waRes.ok) {
      whatsappStatus = 'SENT';
      whatsappSentAt = new Date().toISOString();
      whatsappError = undefined;
    } else {
      whatsappStatus = 'FAILED';
      whatsappError = waRes.error;
      if (waRes.retryable) anyRetryableFailure = true;
    }

    db.addNotificationDeliveryLog({
      category: 'ASSET_RETURN_REMINDER',
      reminderId,
      personId: person.id,
      personName: person.fullName,
      channel: 'WHATSAPP',
      provider: waRes.provider,
      recipient: waRes.recipient || person.phone,
      status: waRes.ok ? 'SENT' : 'FAILED',
      attemptNumber,
      messageId: waRes.messageId,
      statusCode: waRes.statusCode,
      error: waRes.error,
      summary: waRes.ok
        ? `Sent 2-day asset return WhatsApp reminder (${unreturnedAssets.length} unreturned asset(s), deadline ${endIsoDate}).`
        : `WhatsApp reminder failed (${waRes.provider}): ${waRes.error}`,
    });
  }

  const retryCount = existing ? existing.retryCount + 1 : 0;
  let overallStatus: AssetReturnReminderRecord['overallStatus'] = 'SENT';
  let nextRetryAt: string | null = null;

  if (emailStatus === 'SENT' && whatsappStatus === 'SENT') {
    overallStatus = 'SENT';
  } else if (anyRetryableFailure && retryCount < maxRetries) {
    overallStatus = 'RETRY_SCHEDULED';
    nextRetryAt = computeNextRetryIso(retryCount + 1);
  } else if (emailStatus === 'SENT' || whatsappStatus === 'SENT') {
    overallStatus = 'PARTIAL_FAILURE';
  } else {
    overallStatus = 'FAILED_PERMANENTLY';
  }

  const record: AssetReturnReminderRecord = {
    id: reminderId,
    idempotencyKey,
    personId: person.id,
    personName: person.fullName,
    personEmail: person.email,
    personPhone: person.phone,
    isCandidate: Boolean(person.isCandidate),
    endDate: endIsoDate,
    formattedEndDate,
    unreturnedAssets: unreturnedAssets.map((a) => ({
      assetId: a.id,
      assetTag: a.assetTag,
      name: a.name,
      type: a.type,
      serialNumber: a.serialNumber,
      issueDate: a.issueDate,
    })),
    emailStatus,
    whatsappStatus,
    emailError,
    whatsappError,
    emailSentAt,
    whatsappSentAt,
    overallStatus,
    retryCount,
    maxRetries,
    nextRetryAt,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  db.upsertAssetReturnReminder(record);

  db.logAudit(
    actorLabel,
    'HR',
    overallStatus === 'SENT'
      ? '2-Day Asset Return Reminder Sent'
      : `2-Day Asset Return Reminder (${overallStatus})`,
    'Automation',
    person.id,
    person.fullName,
    `End Date: ${endIsoDate} | Unreturned Assets: ${unreturnedAssets
      .map((a) => a.assetTag)
      .join(', ')} | Email: ${emailStatus} | WhatsApp: ${whatsappStatus}${
      nextRetryAt ? ` | Next Retry: ${nextRetryAt}` : ''
    }`
  );

  return record;
}

export async function processAssetReminderRetries(nowIso?: string): Promise<number> {
  if (isRetryRunning) return 0;
  isRetryRunning = true;
  try {
    lastRetryCheckAt = new Date().toISOString();
    const nowTime = nowIso ? new Date(nowIso).getTime() : Date.now();
    const dueRecords = db
      .getAssetReturnReminders()
      .filter(
        (r) =>
          r.overallStatus === 'RETRY_SCHEDULED' &&
          (!r.nextRetryAt || new Date(r.nextRetryAt).getTime() <= nowTime)
      );

    let processed = 0;
    for (const rec of dueRecords) {
      const person = db.getEmployeeById(rec.personId, 'HR');
      if (!person) continue;

      const unreturnedAssets = getUnreturnedAssetsForPerson(person.id);
      if (unreturnedAssets.length === 0) {
        // Assets have been returned since initial failure -> cancel pending retry
        db.upsertAssetReturnReminder({
          ...rec,
          overallStatus: 'CANCELLED_ASSETS_RETURNED',
          nextRetryAt: null,
          updatedAt: new Date().toISOString(),
        });
        processed++;
        continue;
      }

      await dispatchChannelsForReminder(
        person,
        unreturnedAssets,
        rec.endDate,
        rec.formattedEndDate,
        rec.idempotencyKey,
        rec,
        rec.maxRetries,
        'Automated Retry Worker'
      );
      processed++;
    }
    return processed;
  } finally {
    isRetryRunning = false;
  }
}

export function getSchedulerRuntimeStatus() {
  const sweepCron = process.env.ASSET_REMINDER_CRON || '0 * * * *';
  const retryCron = process.env.ASSET_REMINDER_RETRY_CRON || '*/5 * * * *';
  return {
    schedulerActive: Boolean(sweepTask && retryTask),
    sweepCron,
    retryCron,
    maxRetries: Math.max(1, Number(process.env.NOTIFICATION_MAX_RETRIES || 3)),
    lastSweepAt,
    lastRetryCheckAt,
    notificationConfig: getNotificationConfigStatus(),
  };
}

export function startAutomationScheduler() {
  if (sweepTask || retryTask) return;

  const sweepCron = process.env.ASSET_REMINDER_CRON || '0 * * * *';
  const retryCron = process.env.ASSET_REMINDER_RETRY_CRON || '*/5 * * * *';

  sweepTask = cron.schedule(sweepCron, () => {
    runAssetReturnReminderSweep().catch((err) =>
      console.error('[Scheduler] Asset reminder sweep error:', err)
    );
  });

  retryTask = cron.schedule(retryCron, () => {
    processAssetReminderRetries().catch((err) =>
      console.error('[Scheduler] Asset reminder retry error:', err)
    );
  });

  console.log(
    `[Scheduler] Started 2-Day Asset Return Reminder cron (${sweepCron}) & Retry Worker (${retryCron}).`
  );

  // Run an initial non-blocking check shortly after server startup
  setTimeout(() => {
    runAssetReturnReminderSweep().catch((err) =>
      console.error('[Scheduler] Initial startup sweep error:', err)
    );
  }, 1500);
}
