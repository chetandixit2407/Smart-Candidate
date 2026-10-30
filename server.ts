import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { db, QR_MAX_FILE_SIZE_BYTES } from './server/database.ts';
import { ALL_DESK_CODES, mapSpreadsheetSeatToStandardDesk } from './server/seedData.ts';
import { WCR_ORIGINAL_OFFER_SECTIONS, buildOfferLetterData } from './server/lifecycleEngine.ts';
import { generateWcrOfferLetterDocx } from './server/wordGenerator.ts';
import {
  sendEmailNotification,
  sendWhatsAppNotification,
} from './server/notificationService.ts';
import {
  startAutomationScheduler,
  runAssetReturnReminderSweep,
  getSchedulerRuntimeStatus,
} from './server/scheduler.ts';
import type { UserRole, Employee, OfferLetterData, RoleSalaryStructure } from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 4000;

// Universal CORS & Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Actor, X-Role, X-Mime-Type, X-File-Name, X-Forwarded-Proto, X-Forwarded-Host');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Helper: Detect the primary local network IPv4 address (e.g., 192.168.x.x) so mobile devices on the same Wi-Fi can scan and open QR links
export function getLocalLanIpv4(): string | null {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if ((net.family === 'IPv4' || (net as any).family === 4) && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}

// Permanent public HTTPS application endpoint (deployed globally on Cloud Run)
export const PERMANENT_PUBLIC_APP_URL =
  (process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || '').trim() ||
  'https://ais-pre-7vffypp3ujgs3jlohgugve-77684867572.asia-southeast1.run.app';

// Configurable base origin resolver (prioritizes permanent public HTTPS; eliminates unroutable LAN/link-local 169.254 IPs)
export function resolveBaseOrigin(req: Request, clientOriginCandidate?: string, _preferLan?: boolean): string {
  // 1. Client-provided origin candidate from browser (if HTTPS and valid public origin)
  if (clientOriginCandidate && typeof clientOriginCandidate === 'string') {
    try {
      const parsed = new URL(clientOriginCandidate.trim());
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        !parsed.hostname.includes('169.254.') &&
        !parsed.hostname.startsWith('127.') &&
        parsed.hostname !== 'localhost'
      ) {
        return parsed.origin;
      }
    } catch {
      // Fall back
    }
  }

  // 2. Incoming reverse proxy headers from Cloud Run / public hosting
  const forwardedHost = ((req.headers['x-forwarded-host'] as string) || '').split(',')[0].trim();
  const forwardedProto = ((req.headers['x-forwarded-proto'] as string) || 'https').split(',')[0].trim();
  if (
    forwardedHost &&
    !forwardedHost.includes('169.254.') &&
    !forwardedHost.startsWith('127.') &&
    !forwardedHost.includes('localhost')
  ) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // 3. Configured environment base URL (if valid public HTTPS)
  const envBaseUrl = (process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || process.env.APP_URL || '').trim();
  if (
    envBaseUrl &&
    !envBaseUrl.includes('169.254.') &&
    !envBaseUrl.includes('localhost') &&
    !envBaseUrl.includes('127.0.0.1')
  ) {
    try {
      const parsed = new URL(envBaseUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // Fall back
    }
  }

  // 4. Fallback strictly to PERMANENT_PUBLIC_APP_URL
  return PERMANENT_PUBLIC_APP_URL;
}

// --------------------------------------------------------------------------
// Public Streaming Binary QR Upload Endpoint (Registered BEFORE express.json)
// Allows candidates to upload PDF, JPG, and PNG files without HR login,
// enforcing 24-hour expiry, magic-byte validation, duplicate & cross-candidate
// guards, and broadcasting live upload progress to HR via SSE.
// --------------------------------------------------------------------------
app.post('/api/public/document-qr/:token/upload/:docKey', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const rawToken = req.params.token;
  const docKey = req.params.docKey;

  // Immediate pre-stream token & expiry validation
  const tokenCheck = db.validatePublicQrToken(rawToken);
  if (!tokenCheck.ok || !tokenCheck.employee || !tokenCheck.tokenRecord) {
    res.status(tokenCheck.httpStatus).json({
      success: false,
      code: tokenCheck.code,
      error: tokenCheck.error,
    });
    return;
  }

  const { employee, tokenRecord } = tokenCheck;
  const targetDoc = employee.documents?.[docKey];

  if (!targetDoc || targetDoc.status === 'Not Applicable') {
    res.status(403).json({
      success: false,
      code: 'UNAUTHORIZED_DOCUMENT_SLOT',
      error: 'This document type is not part of your onboarding checklist.',
    });
    return;
  }

  if (
    targetDoc.status === 'Uploaded' ||
    targetDoc.status === 'Submitted' ||
    targetDoc.status === 'Under Review' ||
    targetDoc.status === 'Verified'
  ) {
    res.status(409).json({
      success: false,
      code: 'DUPLICATE_UPLOAD',
      error: `Duplicate upload prevented: '${targetDoc.title}' has already been ${targetDoc.status === 'Verified' ? 'verified' : 'uploaded'}.`,
    });
    return;
  }

  if (tokenRecord.targetDocKeys.length > 0 && !tokenRecord.targetDocKeys.includes(docKey)) {
    res.status(403).json({
      success: false,
      code: 'DOCUMENT_NOT_REQUESTED',
      error: 'This document was not requested on your QR checklist.',
    });
    return;
  }

  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > QR_MAX_FILE_SIZE_BYTES) {
    res.status(413).json({
      success: false,
      code: 'FILE_TOO_LARGE',
      error: 'File exceeds the maximum allowed size of 10 MB.',
    });
    return;
  }

  const rawHeaderFileName = (req.headers['x-file-name'] as string) || (req.query.fileName as string) || `${docKey}.pdf`;
  let originalFileName = rawHeaderFileName;
  try {
    originalFileName = decodeURIComponent(rawHeaderFileName);
  } catch {
    originalFileName = rawHeaderFileName;
  }

  const contentTypeHeader = ((req.headers['x-mime-type'] as string) || (req.headers['content-type'] as string) || '')
    .split(';')[0]
    .trim();

  const uploadId = `qrupl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  let abortedForSize = false;
  let lastBroadcastMs = 0;
  let lastBroadcastPct = 0;

  // Broadcast initial upload start to HR dashboard
  db.broadcastQrUploadProgress({
    uploadId,
    employeeId: employee.id,
    employeeName: employee.fullName,
    department: employee.department,
    subDepartment: employee.subDepartment,
    docKey,
    docTitle: targetDoc.title,
    fileName: originalFileName,
    progress: 5,
    status: 'UPLOADING',
    timestamp: new Date().toISOString(),
  });

  req.on('data', (chunk: Buffer) => {
    if (abortedForSize) return;
    receivedBytes += chunk.length;
    if (receivedBytes > QR_MAX_FILE_SIZE_BYTES) {
      abortedForSize = true;
      db.broadcastQrUploadProgress({
        uploadId,
        employeeId: employee.id,
        employeeName: employee.fullName,
        department: employee.department,
        subDepartment: employee.subDepartment,
        docKey,
        docTitle: targetDoc.title,
        fileName: originalFileName,
        progress: 0,
        status: 'FAILED',
        error: 'Exceeded 10 MB size limit',
        timestamp: new Date().toISOString(),
      });
      res.status(413).json({
        success: false,
        code: 'FILE_TOO_LARGE',
        error: 'File exceeds the maximum allowed size of 10 MB.',
      });
      req.destroy();
      return;
    }

    chunks.push(chunk);

    if (declaredLength > 0) {
      const pct = Math.min(95, Math.max(8, Math.round((receivedBytes / declaredLength) * 95)));
      const now = Date.now();
      if (pct - lastBroadcastPct >= 10 || now - lastBroadcastMs >= 120) {
        lastBroadcastPct = pct;
        lastBroadcastMs = now;
        db.broadcastQrUploadProgress({
          uploadId,
          employeeId: employee.id,
          employeeName: employee.fullName,
          department: employee.department,
          subDepartment: employee.subDepartment,
          docKey,
          docTitle: targetDoc.title,
          fileName: originalFileName,
          progress: pct,
          status: 'UPLOADING',
          timestamp: new Date(now).toISOString(),
        });
      }
    }
  });

  req.on('error', () => {
    if (!res.headersSent) {
      res.status(400).json({ success: false, code: 'UPLOAD_STREAM_ERROR', error: 'Upload stream interrupted.' });
    }
  });

  req.on('end', () => {
    if (abortedForSize || res.headersSent) return;

    let fileBuffer = Buffer.concat(chunks);
    let finalFileName = originalFileName;
    let finalMime = contentTypeHeader;

    // Support JSON base64 payload fallback if client sent application/json
    if (contentTypeHeader.toLowerCase() === 'application/json') {
      try {
        const parsedJson = JSON.parse(fileBuffer.toString('utf-8'));
        if (parsedJson.fileName) finalFileName = String(parsedJson.fileName);
        if (parsedJson.mimeType) finalMime = String(parsedJson.mimeType);
        if (typeof parsedJson.fileData === 'string') {
          const b64Match = parsedJson.fileData.match(/^data:([^;]+);base64,(.+)$/);
          if (b64Match) {
            finalMime = finalMime || b64Match[1];
            fileBuffer = Buffer.from(b64Match[2], 'base64');
          } else {
            fileBuffer = Buffer.from(parsedJson.fileData, 'base64');
          }
        }
      } catch {
        res.status(400).json({ success: false, code: 'INVALID_JSON', error: 'Malformed upload payload.' });
        return;
      }
    }

    const result = db.savePublicQrDocumentUpload(
      rawToken,
      docKey,
      fileBuffer,
      finalFileName,
      finalMime,
      uploadId
    );

    if (!result.ok) {
      db.broadcastQrUploadProgress({
        uploadId,
        employeeId: employee.id,
        employeeName: employee.fullName,
        department: employee.department,
        subDepartment: employee.subDepartment,
        docKey,
        docTitle: targetDoc.title,
        fileName: finalFileName,
        progress: 0,
        status: 'FAILED',
        error: result.error || 'Validation failed',
        timestamp: new Date().toISOString(),
      });
      res.status(result.httpStatus).json({
        success: false,
        code: result.code,
        error: result.error,
      });
      return;
    }

    res.status(200).json({
      success: true,
      code: result.code,
      slot: result.slot,
      session: result.session,
    });
  });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const VALID_ROLES: UserRole[] = ['HR', 'Co-Founder', 'CEO'];
const ALL_ROLES: UserRole[] = ['HR', 'Co-Founder', 'CEO'];
const OPERATIONAL_ROLES: UserRole[] = ['HR', 'Co-Founder'];

function authenticateRequest(
  req: Request,
  res: Response,
  allowedRoles: UserRole[] = ALL_ROLES,
  options?: { allowQueryRole?: boolean }
): { actor: string; role: UserRole } | null {
  const configuredSecret = (process.env.HR_API_SECRET || '').trim();
  if (configuredSecret) {
    const headerKey = (req.headers['x-api-key'] as string) || '';
    const bearer = ((req.headers['authorization'] as string) || '').replace(/^Bearer\s+/i, '');
    const queryKey = options?.allowQueryRole ? ((req.query.apiKey as string) || '') : '';
    const provided = headerKey || bearer || queryKey;
    if (provided !== configuredSecret) {
      res.status(401).json({ error: 'Unauthorized: Invalid or missing API secret credential.' });
      return null;
    }
  }

  const rawRole = (
    (req.headers['x-user-role'] as string) ||
    (options?.allowQueryRole ? (req.query.role as string) : '') ||
    ''
  ).trim();

  if (!rawRole) {
    res.status(401).json({
      error: 'Authentication required: Provide a valid x-user-role header (HR, Co-Founder, or CEO).',
    });
    return null;
  }

  if (!VALID_ROLES.includes(rawRole as UserRole)) {
    res.status(403).json({
      error: `Invalid role '${rawRole}'. Only 3 roles exist: HR, Co-Founder, CEO.`,
    });
    return null;
  }

  const role = rawRole as UserRole;
  if (!allowedRoles.includes(role)) {
    res.status(403).json({
      error: `Permission denied: Role '${role}' cannot perform this action. Authorized role(s): ${allowedRoles.join(', ')}.`,
    });
    return null;
  }

  const rawName = (
    (req.headers['x-user-name'] as string) ||
    (options?.allowQueryRole ? (req.query.name as string) : '') ||
    `${role} User`
  )
    .trim()
    .slice(0, 120);

  return { actor: rawName || `${role} User`, role };
}

// --------------------------------------------------------------------------
// Real-Time Server-Sent Events (SSE) Bus
// --------------------------------------------------------------------------
app.get('/api/events', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES, { allowQueryRole: true });
  if (!auth) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  db.addSSEClient(res);

  // Send initial connection packet
  res.write(`event: CONNECTED\ndata: ${JSON.stringify({ status: 'connected', role: auth.role, time: new Date().toISOString() })}\n\n`);
});

// --------------------------------------------------------------------------
// Current User / Auth Status
// --------------------------------------------------------------------------
app.get('/api/auth/me', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const { actor, role } = auth;
  res.json({
    user: {
      id: 'usr-current',
      name: actor,
      email:
        role === 'CEO'
          ? 'ceo@whitecollarrealty.com'
          : role === 'Co-Founder'
          ? 'cofounder@whitecollarrealty.com'
          : 'hr@whitecollarrealty.com',
      role,
      department: role === 'HR' ? 'People Operations & HR' : 'Executive Leadership',
    },
  });
});

// --------------------------------------------------------------------------
// Dashboard Statistics & KPI Metrics
// --------------------------------------------------------------------------
app.get('/api/stats', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const { role } = auth;
  const allEmployees = db.getEmployees(role);
  const activeEmployees = allEmployees.filter(e => !e.isCandidate);
  const candidates = allEmployees.filter(e => e.isCandidate);
  const desks = db.getDesks();
  const assets = db.getAssets();

  // Calculate pending documents & uploaded awaiting verification
  let pendingDocsCount = 0;
  let uploadedAwaitingVerificationCount = 0;
  allEmployees.forEach(e => {
    if (e.documents) {
      Object.values(e.documents).forEach(d => {
        if (d.status === 'Uploaded' || d.status === 'Submitted' || d.status === 'Under Review') {
          uploadedAwaitingVerificationCount++;
        }
        if (
          d.required &&
          (d.status === 'Missing' ||
            d.status === 'Not Submitted' ||
            d.status === 'Uploaded' ||
            d.status === 'Submitted' ||
            d.status === 'Under Review' ||
            d.status === 'Rejected')
        ) {
          pendingDocsCount++;
        }
      });
    }
  });

  const incompleteProfilesCount = allEmployees.filter(e => (e.profileCompletion || 0) < 85).length;
  const assetsIssuedCount = assets.filter(a => a.status === 'In Use').length;
  const occupiedDesksCount = desks.filter(d => d.status === 'Occupied').length;
  const reservedDesksCount = desks.filter(d => d.status === 'Reserved').length;
  const availableDesksCount = desks.filter(d => d.status === 'Available').length;
  const departments = db.getDepartmentsWithCounts();

  res.json({
    totalEmployees: activeEmployees.length,
    upcomingJoiners: candidates.length,
    pendingDocuments: pendingDocsCount,
    uploadedAwaitingVerification: uploadedAwaitingVerificationCount,
    totalDepartments: departments.length,
    incompleteProfiles: incompleteProfilesCount,
    assetsIssued: assetsIssuedCount,
    totalAssets: assets.length,
    deskMetrics: {
      total: desks.length,
      occupied: occupiedDesksCount,
      reserved: reservedDesksCount,
      available: availableDesksCount,
    },
    recentLogs: db.getAuditLogs(6),
    upcomingAlertsCount: db.getUpcomingAlerts(undefined, 2, true).length,
  });
});

// --------------------------------------------------------------------------
// Configurable Departments & Sub-Departments Endpoints
// --------------------------------------------------------------------------
app.get('/api/departments', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  res.json({ departments: db.getDepartmentsWithCounts() });
});

app.post('/api/departments', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const result = db.createDepartment(req.body || {}, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json({ department: result.department, departments: db.getDepartmentsWithCounts() });
});

app.put('/api/departments/:id', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const result = db.updateDepartment(req.params.id, req.body || {}, auth.actor, auth.role);
  if (!result.success) {
    res.status(result.error === 'Department not found.' ? 404 : 400).json({ error: result.error });
    return;
  }
  res.json({ department: result.department, departments: db.getDepartmentsWithCounts() });
});

app.delete('/api/departments/:id', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const reassignTo =
    (req.query.reassignToDepartmentId as string) ||
    (req.body && req.body.reassignToDepartmentId) ||
    undefined;
  const result = db.deleteDepartment(req.params.id, reassignTo, auth.actor, auth.role);
  if (!result.success) {
    res.status(result.error === 'Department not found.' ? 404 : 400).json({ error: result.error });
    return;
  }
  res.json({ success: true, departments: db.getDepartmentsWithCounts() });
});

app.post('/api/departments/:id/sub-departments', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const result = db.addSubDepartment(req.params.id, req.body || {}, auth.actor, auth.role);
  if (!result.success) {
    res.status(result.error === 'Department not found.' ? 404 : 400).json({ error: result.error });
    return;
  }
  res.status(201).json({ department: result.department, departments: db.getDepartmentsWithCounts() });
});

app.put('/api/departments/:id/sub-departments/:subId', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const result = db.updateSubDepartment(req.params.id, req.params.subId, req.body || {}, auth.actor, auth.role);
  if (!result.success) {
    res.status(result.error?.includes('not found') ? 404 : 400).json({ error: result.error });
    return;
  }
  res.json({ department: result.department, departments: db.getDepartmentsWithCounts() });
});

app.delete('/api/departments/:id/sub-departments/:subId', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const result = db.deleteSubDepartment(req.params.id, req.params.subId, auth.actor, auth.role);
  if (!result.success) {
    res.status(result.error?.includes('not found') ? 404 : 400).json({ error: result.error });
    return;
  }
  res.json({ department: result.department, departments: db.getDepartmentsWithCounts() });
});

// --------------------------------------------------------------------------
// Employment Categories Dynamic CRUD Endpoints
// --------------------------------------------------------------------------
app.get('/api/employment-categories', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  res.json({ categories: db.getEmploymentCategories() });
});

app.post('/api/employment-categories', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const result = db.createEmploymentCategory(req.body?.name || '', auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

app.delete('/api/employment-categories/:name', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const result = db.deleteEmploymentCategory(req.params.name, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

// --------------------------------------------------------------------------
// Individual 24-Hour Document QR Endpoints (Protected HR + Public Candidate)
// --------------------------------------------------------------------------
app.get('/api/public/document-qr/:token', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const recordOpen = req.query.silent !== 'true';
  const result = db.getPublicQrUploadSession(req.params.token, recordOpen);
  if (!result.ok || !result.session) {
    res.status(result.httpStatus).json({
      valid: false,
      code: result.code,
      error: result.error,
    });
    return;
  }
  res.json(result.session);
});

app.get('/api/system/network-info', (req: Request, res: Response) => {
  const defaultOrigin = resolveBaseOrigin(req);
  res.json({
    port: PORT,
    defaultOrigin,
    permanentPublicAppUrl: PERMANENT_PUBLIC_APP_URL,
    configuredBaseUrl: process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || PERMANENT_PUBLIC_APP_URL,
  });
});

app.get('/api/employees/:id/document-qr', async (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;

  const customOrigin = (req.query.customOrigin as string) || (req.query.clientOrigin as string | undefined);
  const baseOrigin = resolveBaseOrigin(req, customOrigin);
  const canViewSecret = auth.role === 'HR' || auth.role === 'Co-Founder';
  const status = await db.getEmployeeDocumentQrStatus(req.params.id, baseOrigin, canViewSecret);
  if (!status) {
    res.status(404).json({ error: 'Employee or candidate profile not found.' });
    return;
  }

  res.json({
    ...status,
    networkInfo: {
      port: PORT,
      defaultOrigin: baseOrigin,
      permanentPublicAppUrl: PERMANENT_PUBLIC_APP_URL,
      configuredBaseUrl: PERMANENT_PUBLIC_APP_URL,
    },
  });
});

app.post('/api/employees/:id/document-qr', async (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const customOrigin = req.body?.customOrigin || req.body?.clientOrigin;
  const baseOrigin = resolveBaseOrigin(req, customOrigin);
  const result = await db.generateEmployeeDocumentQr(
    req.params.id,
    baseOrigin,
    auth.actor,
    auth.role,
    {
      includeOptionalMissing: Boolean(req.body?.includeOptionalMissing),
      customDocKeys: Array.isArray(req.body?.customDocKeys) ? req.body.customDocKeys : undefined,
    }
  );

  if (!result.success) {
    res.status(404).json({ error: result.message });
    return;
  }

  res.status(201).json({
    ...result,
    networkInfo: {
      port: PORT,
      defaultOrigin: baseOrigin,
      permanentPublicAppUrl: PERMANENT_PUBLIC_APP_URL,
      configuredBaseUrl: PERMANENT_PUBLIC_APP_URL,
    },
  });
});

app.post('/api/employees/:id/document-qr/revoke', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const result = db.revokeEmployeeDocumentQr(req.params.id, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json({ error: result.message });
    return;
  }
  res.json(result);
});

// --------------------------------------------------------------------------
// Employees & Candidates Endpoints
// --------------------------------------------------------------------------
app.get('/api/employees', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const { role } = auth;
  const isCandidateQuery = req.query.isCandidate;
  const search = req.query.search as string;
  const department = req.query.department as string;
  const departmentId = req.query.departmentId as string;
  const subDepartment = req.query.subDepartment as string;

  let isCandidate: boolean | undefined = undefined;
  if (isCandidateQuery === 'true') isCandidate = true;
  if (isCandidateQuery === 'false') isCandidate = false;

  const list = db.getEmployees(role, { isCandidate, search, department, departmentId, subDepartment });
  res.json({ employees: list, total: list.length });
});

app.get('/api/employees/:id', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const emp = db.getEmployeeById(req.params.id, auth.role);
  if (!emp) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(emp);
});

app.post('/api/employees', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const created = db.createEmployee(req.body, auth.actor, auth.role);
  res.status(201).json(created);
});

app.put('/api/employees/:id', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const updated = db.updateEmployee(req.params.id, req.body, auth.actor, auth.role);
  if (!updated) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(updated);
});

app.delete('/api/employees/:id', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const deleted = db.deleteEmployee(req.params.id, auth.actor, auth.role);
  if (!deleted) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json({ success: true, message: 'Record deleted successfully.' });
});

app.post('/api/candidates/:id/convert', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const converted = db.convertCandidateToEmployee(req.params.id, req.body, auth.actor, auth.role);
  if (!converted) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }
  res.json(converted);
});

// Document verification status endpoint
app.put('/api/employees/:id/documents/:docKey', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const { status, reviewNotes, verifiedBy, fileName, fileSize, fileData, mimeType } = req.body;
  if (!status) {
    res.status(400).json({ error: 'Document status is required' });
    return;
  }

  const updated = db.updateDocument(
    req.params.id,
    req.params.docKey,
    { status, reviewNotes, verifiedBy, fileName, fileSize, fileData, mimeType },
    auth.actor,
    auth.role
  );

  if (!updated) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(updated);
});

// Direct file upload for document
app.post('/api/employees/:id/documents/:docKey/upload', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const { fileData, fileName, fileSize, mimeType, status, reviewNotes } = req.body;
  if (!fileData) {
    res.status(400).json({ error: 'fileData is required' });
    return;
  }

  const updated = db.updateDocument(
    req.params.id,
    req.params.docKey,
    {
      status: status || 'Submitted',
      reviewNotes,
      fileName: fileName || 'Document.pdf',
      fileSize: fileSize || '1.0 MB',
      fileData,
      mimeType: mimeType || 'application/pdf',
    },
    auth.actor,
    auth.role
  );

  if (!updated) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(updated);
});

app.delete('/api/employees/:id/documents/:docKey', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const result = db.deleteEmployeeDocumentFile(req.params.id, req.params.docKey, auth.actor, auth.role);
  if (!result.success) {
    res.status(404).json({ error: result.message });
    return;
  }
  res.json(result);
});

// Helper to handle secure document serving and downloading
function handleDocumentStreaming(req: Request, res: Response, isDownload: boolean) {
  const employeeId = req.params.id;
  const docKey = req.params.docKey;
  const queryToken = req.query.token as string | undefined;

  let isAuthorized = false;

  if (queryToken) {
    const publicCand = db.getPublicCandidateByToken(queryToken);
    if (publicCand.valid && publicCand.candidate?.id === employeeId) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    const auth = authenticateRequest(req, res, ALL_ROLES);
    if (!auth) return;
    isAuthorized = true;
  }

  const fileInfo = db.getSecureDocumentFile(employeeId, docKey);
  if (!fileInfo) {
    res.status(404).json({ error: 'No document file has been uploaded for this item yet.' });
    return;
  }

  const sanitizedFileName = fileInfo.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', fileInfo.mimeType);

  if (isDownload) {
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
  } else {
    res.setHeader('Content-Disposition', `inline; filename="${sanitizedFileName}"`);
  }

  if (fileInfo.buffer) {
    res.setHeader('Content-Length', fileInfo.buffer.length.toString());
    res.send(fileInfo.buffer);
    return;
  }

  if (fileInfo.filePath && fs.existsSync(fileInfo.filePath)) {
    const stat = fs.statSync(fileInfo.filePath);
    res.setHeader('Content-Length', stat.size.toString());
    const stream = fs.createReadStream(fileInfo.filePath);
    stream.pipe(res);
    return;
  }

  res.status(404).json({ error: 'Document file not found on secure storage.' });
}

// Secure Document View & Download Endpoints
app.get('/api/employees/:id/documents/:docKey/file', (req: Request, res: Response) => {
  handleDocumentStreaming(req, res, false);
});

app.get('/api/employees/:id/documents/:docKey/download', (req: Request, res: Response) => {
  handleDocumentStreaming(req, res, true);
});

// Candidate document upload link management with configurable expiry and single/multi use
app.post('/api/candidates/:id/upload-link/generate', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const { expiryDays, isOneTime } = req.body || {};
  const result = db.generateUploadToken(req.params.id, auth.actor, auth.role, {
    expiryDays: typeof expiryDays === 'number' ? expiryDays : undefined,
    isOneTime: typeof isOneTime === 'boolean' ? isOneTime : undefined,
  });

  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/candidates/:id/upload-link/revoke', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const result = db.revokeUploadToken(req.params.id, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

// Public Candidate Document Upload Portal endpoints (no auth required)
app.get('/api/public/upload-portal/:token', (req: Request, res: Response) => {
  const token = req.params.token;
  const result = db.getPublicCandidateByToken(token);
  if (!result.valid) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post('/api/public/upload-portal/:token/submit', (req: Request, res: Response) => {
  const token = req.params.token;
  const { documents } = req.body;
  if (!documents || typeof documents !== 'object') {
    res.status(400).json({ error: 'No documents provided for submission.' });
    return;
  }

  const result = db.submitCandidateUpload(token, documents);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

// --------------------------------------------------------------------------
// End-to-End HR Lifecycle Endpoints (Recruitment, Offer, Probation, Exit, FnF)
// --------------------------------------------------------------------------

// 1. Interviews
app.post('/api/candidates/:id/interviews', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const result = db.addInterviewRound(req.params.id, req.body, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.put('/api/candidates/:id/interviews/:roundId', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const result = db.updateInterviewRound(req.params.id, req.params.roundId, req.body, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.delete('/api/candidates/:id/interviews/:roundId', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const result = db.deleteInterviewRound(req.params.id, req.params.roundId, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

// 2. Offer Letter (STRICTLY HR and Co-Founder for generate/edit; CEO can preview & download saved .docx)
app.post('/api/candidates/:id/offer-letter/generate', async (req: Request, res: Response) => {
  try {
    const auth = authenticateRequest(req, res, ['HR', 'Co-Founder']);
    if (!auth) return;

    const candidate = db.getEmployeeById(req.params.id, auth.role);
    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }

    const customOverrides = (req.body || {}) as Partial<OfferLetterData>;
    const previewOffer = buildOfferLetterData(candidate, customOverrides, db.getSalaryStructures());
    const docxBuffer = await generateWcrOfferLetterDocx(previewOffer);
    const result = db.saveGeneratedOfferLetterWithDocx(
      req.params.id,
      auth.actor,
      auth.role,
      customOverrides,
      docxBuffer
    );

    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err: any) {
    console.error('[Offer Generate Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to generate and save offer letter.' });
  }
});

app.put('/api/candidates/:id/offer-letter', async (req: Request, res: Response) => {
  try {
    const auth = authenticateRequest(req, res, ['HR', 'Co-Founder']);
    if (!auth) return;

    const candidate = db.getEmployeeById(req.params.id, auth.role);
    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }

    const customOverrides = (req.body || {}) as Partial<OfferLetterData>;
    const previewOffer = buildOfferLetterData(candidate, customOverrides, db.getSalaryStructures());
    const docxBuffer = await generateWcrOfferLetterDocx(previewOffer);
    const result = db.saveGeneratedOfferLetterWithDocx(
      req.params.id,
      auth.actor,
      auth.role,
      customOverrides,
      docxBuffer
    );

    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err: any) {
    console.error('[Offer Update Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to update and save offer letter.' });
  }
});

app.get('/api/candidates/:id/offer-letter/files', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;

  const candidate = db.getEmployeeById(req.params.id, auth.role);
  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }

  res.json({
    candidateId: candidate.id,
    candidateName: candidate.fullName,
    savedOfferLetters: candidate.savedOfferLetters || [],
    currentOfferLetter: candidate.offerLetter || null,
  });
});

app.get('/api/candidates/:id/offer-letter/files/:fileId/download', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;

  const saved = db.getSavedOfferLetterFile(req.params.id, req.params.fileId);
  if (!saved) {
    res.status(404).json({ error: 'Saved offer letter .docx file not found.' });
    return;
  }

  const stat = fs.statSync(saved.filePath);
  const sanitizedFileName = saved.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
  res.setHeader('Content-Length', stat.size.toString());
  fs.createReadStream(saved.filePath).pipe(res);
});

app.post('/api/candidates/:id/offer-letter/approve', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const result = db.approveOfferLetter(req.params.id, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/candidates/:id/offer-letter/issue', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ['HR', 'Co-Founder']);
  if (!auth) return;
  const result = db.issueOfferLetter(req.params.id, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/candidates/:id/offer-letter/accept', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const { signatureName, actor } = req.body || {};
  const result = db.acceptOfferLetter(
    req.params.id,
    signatureName || 'Candidate',
    actor || auth.actor,
    auth.role
  );
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

// Email approved offer letter to candidate via real Email API (requires prior approval)
app.post('/api/candidates/:id/offer-letter/email', async (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ['HR', 'Co-Founder']);
  if (!auth) return;

  const candidate = db.getEmployeeById(req.params.id, auth.role);
  if (!candidate || !candidate.offerLetter) {
    res.status(404).json({ success: false, error: 'Candidate or offer letter not found.' });
    return;
  }

  if (
    candidate.offerLetter.status !== 'Approved' &&
    candidate.offerLetter.status !== 'Issued' &&
    candidate.offerLetter.status !== 'Accepted'
  ) {
    res.status(400).json({
      success: false,
      error: 'The offer letter must be formally approved before emailing the candidate.',
    });
    return;
  }

  // Ensure we attach the saved .docx (or generate & save if missing)
  let docxBuffer: Buffer;
  let attachmentName: string;
  const latestSaved = db.getSavedOfferLetterFile(candidate.id);
  if (latestSaved && fs.existsSync(latestSaved.filePath)) {
    docxBuffer = fs.readFileSync(latestSaved.filePath);
    attachmentName = latestSaved.fileName;
  } else {
    const offerData = buildOfferLetterData(candidate, candidate.offerLetter, db.getSalaryStructures());
    docxBuffer = await generateWcrOfferLetterDocx(offerData);
    const savedRes = db.saveGeneratedOfferLetterWithDocx(
      candidate.id,
      auth.actor,
      auth.role,
      candidate.offerLetter,
      docxBuffer
    );
    attachmentName = savedRes.savedFile?.fileName || `Offer_Letter_${candidate.fullName}.docx`;
  }

  const emailRes = await sendEmailNotification({
    to: candidate.email,
    subject: `Official Offer of Employment — White Collar Realty (${candidate.offerLetter.designation})`,
    text: `Dear ${candidate.fullName},\n\nCongratulations! Please find attached your official Offer Letter (Ref: ${candidate.offerLetter.refNo}) for the position of ${candidate.offerLetter.designation} (${candidate.offerLetter.department}) at White Collar Realty.\n\nProposed Joining Date: ${candidate.offerLetter.joiningDate}\nOffer Valid Till: ${candidate.offerLetter.validTillDate}\n\nWarm regards,\n${auth.actor}\nWhite Collar Realty HR`,
    attachments: [
      {
        filename: attachmentName,
        content: docxBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ],
  });

  db.addNotificationDeliveryLog({
    category: 'OFFER_LETTER_EMAIL',
    personId: candidate.id,
    personName: candidate.fullName,
    channel: 'EMAIL',
    provider: emailRes.provider,
    recipient: emailRes.recipient || candidate.email,
    status: emailRes.ok ? 'SENT' : 'FAILED',
    attemptNumber: 1,
    messageId: emailRes.messageId,
    statusCode: emailRes.statusCode,
    error: emailRes.error,
    summary: emailRes.ok
      ? `Emailed official .docx offer letter (${attachmentName}) to ${candidate.email}.`
      : `Offer letter email dispatch failed (${emailRes.provider}): ${emailRes.error}`,
  });

  if (!emailRes.ok) {
    res.status(502).json({
      success: false,
      error: emailRes.error || 'Real Email API dispatch failed.',
      deliveryResult: emailRes,
    });
    return;
  }

  const result = db.emailOfferLetter(req.params.id, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json({ ...result, deliveryResult: emailRes });
});

// Download Saved Offer Letter in Genuine Editable Microsoft Word (.docx) Format
app.get('/api/candidates/:id/offer-letter/docx', async (req: Request, res: Response) => {
  try {
    const auth = authenticateRequest(req, res, ALL_ROLES);
    if (!auth) return;

    const candidate = db.getEmployeeById(req.params.id, auth.role);
    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }

    const latestSaved = db.getSavedOfferLetterFile(candidate.id);
    if (latestSaved && fs.existsSync(latestSaved.filePath)) {
      const stat = fs.statSync(latestSaved.filePath);
      const sanitizedFileName = latestSaved.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
      res.setHeader('Content-Length', stat.size.toString());
      fs.createReadStream(latestSaved.filePath).pipe(res);
      return;
    }

    if (!candidate.offerLetter && auth.role === 'CEO') {
      res.status(404).json({
        error: 'No saved offer letter exists for this candidate yet. Only HR and Co-Founder can generate offer letters.',
      });
      return;
    }

    const offerData = buildOfferLetterData(candidate, candidate.offerLetter, db.getSalaryStructures());
    const docxBuffer = await generateWcrOfferLetterDocx(offerData);

    if (auth.role === 'HR' || auth.role === 'Co-Founder') {
      db.saveGeneratedOfferLetterWithDocx(
        candidate.id,
        auth.actor,
        auth.role,
        candidate.offerLetter,
        docxBuffer
      );
    }

    const sanitizedName = (offerData.candidateName || candidate.fullName || 'Candidate').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `White_Collar_Realty_Offer_Letter_${sanitizedName}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', docxBuffer.length);
    res.send(docxBuffer);
  } catch (error: any) {
    console.error('[Docx Export Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to download Word offer letter' });
  }
});

// Generate + Save + Download Offer Letter (.docx) — STRICTLY HR & Co-Founder
app.post('/api/candidates/:id/offer-letter/docx', async (req: Request, res: Response) => {
  try {
    const auth = authenticateRequest(req, res, ['HR', 'Co-Founder']);
    if (!auth) return;

    const candidate = db.getEmployeeById(req.params.id, auth.role);
    if (!candidate) {
      res.status(404).json({ error: 'Candidate not found' });
      return;
    }

    const customData = (req.body || {}) as Partial<OfferLetterData>;
    const mergedData = buildOfferLetterData(candidate, customData, db.getSalaryStructures());

    const docxBuffer = await generateWcrOfferLetterDocx(mergedData);
    const saved = db.saveGeneratedOfferLetterWithDocx(
      candidate.id,
      auth.actor,
      auth.role,
      customData,
      docxBuffer
    );

    const filename =
      saved.savedFile?.fileName ||
      `White_Collar_Realty_Offer_Letter_${(mergedData.candidateName || candidate.fullName || 'Candidate').replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', docxBuffer.length);
    res.send(docxBuffer);
  } catch (error: any) {
    console.error('[Docx Export Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to generate Word offer letter' });
  }
});

// Configurable Role-Based Salary Structures Endpoints
app.get('/api/salary-structures', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  res.json({ structures: db.getSalaryStructures() });
});

app.post('/api/salary-structures', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ['HR', 'Co-Founder']);
  if (!auth) return;
  const body = (req.body || {}) as Partial<RoleSalaryStructure>;
  if (!body.designation || !body.designation.trim()) {
    res.status(400).json({ error: 'designation is required.' });
    return;
  }
  const saved = db.saveSalaryStructure(
    body as Partial<RoleSalaryStructure> & { designation: string },
    auth.actor,
    auth.role
  );
  res.json({ success: true, structure: saved, structures: db.getSalaryStructures() });
});

app.delete('/api/salary-structures/:id', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ['HR', 'Co-Founder']);
  if (!auth) return;
  const deleted = db.deleteSalaryStructure(req.params.id, auth.actor, auth.role);
  if (!deleted) {
    res.status(400).json({ error: 'Could not delete salary structure.' });
    return;
  }
  res.json({ success: true, structures: db.getSalaryStructures() });
});

// Master Offer Letter Template (Full 10-page legal clauses and annexures)
app.get('/api/offer-letter/master-template', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  res.json({
    templateVersion: 'v1.0-official-10page',
    companyName: 'White Collar Realty',
    tagline: 'A Tradition Of Trust',
    sections: WCR_ORIGINAL_OFFER_SECTIONS,
    salaryStructures: db.getSalaryStructures(),
    contactInfo: {
      phone: '+91 124-4349007',
      email: 'hr@whitecollarrealty.com',
      address: '6th floor, TOWER-A, M3M Urbana Business Park, Sector 67, Gurugram, Haryana 122101',
    },
  });
});

// Missing Document Reminders Endpoints
app.get('/api/candidates/:id/missing-documents', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const result = db.getMissingRequiredDocuments(req.params.id);
  if (!result.candidate) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }
  res.json(result);
});

app.post('/api/candidates/:id/reminders/send', async (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ['HR', 'Co-Founder']);
  if (!auth) return;

  const { channel, missingDocumentKeys, deadlineHours, messageBody, emailSubject, recipientEmail, recipientPhone } = req.body || {};
  if (!channel || (channel !== 'EMAIL' && channel !== 'WHATSAPP' && channel !== 'BOTH')) {
    res.status(400).json({ error: 'channel must be EMAIL, WHATSAPP, or BOTH' });
    return;
  }

  const result = db.recordDocumentReminder(
    req.params.id,
    {
      channel,
      missingDocumentKeys,
      deadlineHours: typeof deadlineHours === 'number' ? deadlineHours : 24,
      messageBody,
      emailSubject,
      recipientEmail,
      recipientPhone,
    },
    auth.actor,
    auth.role
  );

  if (!result.success || !result.reminder || !result.candidate) {
    res.status(400).json(result);
    return;
  }

  const deliveryResults: Record<string, any> = {};
  if (channel === 'EMAIL' || channel === 'BOTH') {
    const emailRes = await sendEmailNotification({
      to: result.reminder.recipientEmail,
      subject: result.reminder.emailSubject || 'Action Required: Missing Onboarding Documents — White Collar Realty',
      text: result.reminder.messageBody,
    });
    deliveryResults.email = emailRes;
    db.addNotificationDeliveryLog({
      category: 'DOCUMENT_REMINDER',
      reminderId: result.reminder.id,
      personId: result.candidate.id,
      personName: result.candidate.fullName,
      channel: 'EMAIL',
      provider: emailRes.provider,
      recipient: emailRes.recipient || result.reminder.recipientEmail,
      status: emailRes.ok ? 'SENT' : 'FAILED',
      attemptNumber: 1,
      messageId: emailRes.messageId,
      statusCode: emailRes.statusCode,
      error: emailRes.error,
      summary: emailRes.ok
        ? `Sent missing-document email reminder to ${result.reminder.recipientEmail}.`
        : `Missing-document email failed (${emailRes.provider}): ${emailRes.error}`,
    });
  }

  if (channel === 'WHATSAPP' || channel === 'BOTH') {
    const waRes = await sendWhatsAppNotification({
      toPhone: result.reminder.recipientPhone,
      message: result.reminder.messageBody,
    });
    deliveryResults.whatsapp = waRes;
    db.addNotificationDeliveryLog({
      category: 'DOCUMENT_REMINDER',
      reminderId: result.reminder.id,
      personId: result.candidate.id,
      personName: result.candidate.fullName,
      channel: 'WHATSAPP',
      provider: waRes.provider,
      recipient: waRes.recipient || result.reminder.recipientPhone,
      status: waRes.ok ? 'SENT' : 'FAILED',
      attemptNumber: 1,
      messageId: waRes.messageId,
      statusCode: waRes.statusCode,
      error: waRes.error,
      summary: waRes.ok
        ? `Sent missing-document WhatsApp reminder to ${waRes.recipient}.`
        : `Missing-document WhatsApp failed (${waRes.provider}): ${waRes.error}`,
    });
  }

  res.json({ ...result, deliveryResults });
});

app.get('/api/candidates/:id/reminders', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const cand = db.getEmployeeById(req.params.id, auth.role);
  if (!cand) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }
  res.json({
    candidateId: cand.id,
    candidateName: cand.fullName,
    reminders: cand.documentReminders || [],
    lastReminderSentAt: cand.lastReminderSentAt,
    lastReminderChannel: cand.lastReminderChannel,
    deadline: cand.reminderDeadline,
  });
});

// 3. Probation Management
app.post('/api/employees/:id/probation/review', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const result = db.recordProbationReview(req.params.id, req.body, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/employees/:id/probation/confirm', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const { confirmationLetterRef } = req.body || {};
  const result = db.confirmProbation(req.params.id, auth.actor, auth.role, confirmationLetterRef);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/employees/:id/probation/extend', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const { extensionMonths, reason } = req.body || {};
  const result = db.extendProbation(req.params.id, extensionMonths || 1, reason || 'Performance observation', auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

// 4. Exit, Clearances & FnF Settlement
app.post('/api/employees/:id/exit/initiate', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const result = db.initiateExit(req.params.id, req.body, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.put('/api/employees/:id/exit/clearance/:dept', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const rawDept = req.params.dept;
  const deptKey = (
    rawDept === 'it' || rawDept === 'itClearance' ? 'itClearance' :
    rawDept === 'hr' || rawDept === 'hrClearance' ? 'hrClearance' :
    rawDept === 'finance' || rawDept === 'financeClearance' ? 'financeClearance' :
    'deptHeadClearance'
  );
  const result = db.updateExitClearance(req.params.id, deptKey, req.body, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/employees/:id/exit/fnf/calculate', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const result = db.calculateFnF(req.params.id, req.body);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/employees/:id/exit/fnf/settle', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  const result = db.finalizeFnFSettlement(req.params.id, req.body || {}, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

// --------------------------------------------------------------------------
// Desk Allocation Endpoints
// --------------------------------------------------------------------------
app.get('/api/desks', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const desks = db.getDesks();
  res.json({ desks, total: desks.length, allowedDesks: ALL_DESK_CODES });
});

app.post('/api/desks/assign', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const { deskCode, employeeId } = req.body;
  if (!deskCode || !employeeId) {
    res.status(400).json({ error: 'Both deskCode and employeeId are required.' });
    return;
  }

  const result = db.assignDesk(deskCode, employeeId, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/desks/release', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const { deskCode } = req.body;
  if (!deskCode) {
    res.status(400).json({ error: 'deskCode is required.' });
    return;
  }

  const result = db.releaseDesk(deskCode, auth.actor, auth.role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

// --------------------------------------------------------------------------
// Company Assets & Inventory Endpoints (Managed inside Candidate/Employee Profile)
// --------------------------------------------------------------------------
app.get('/api/assets', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const assets = db.getAssets();
  res.json({ assets, total: assets.length });
});

app.get('/api/assets/:id', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const asset = db.getAssetById(req.params.id);
  if (!asset) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  res.json(asset);
});

app.post('/api/assets', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const created = db.createAsset(req.body, auth.actor, auth.role);
  res.status(201).json(created);
});

app.put('/api/assets/:id', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const updated = db.updateAsset(req.params.id, req.body, auth.actor, auth.role);
  if (!updated) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  res.json(updated);
});

app.post('/api/assets/:id/issue', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const { employeeId, issueDate, expectedReturnDate, notes } = req.body;
  if (!employeeId) {
    res.status(400).json({ error: 'employeeId is required.' });
    return;
  }

  const updated = db.issueAsset(
    req.params.id,
    employeeId,
    issueDate,
    notes,
    auth.actor,
    auth.role,
    expectedReturnDate
  );
  if (!updated) {
    res.status(400).json({ error: 'Unable to issue asset. Verify asset and employee exist.' });
    return;
  }
  res.json(updated);
});

app.post('/api/assets/:id/return', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const { returnDate, condition, notes } = req.body;
  const updated = db.returnAsset(req.params.id, returnDate, condition, notes, auth.actor, auth.role);
  if (!updated) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  res.json(updated);
});

app.post('/api/assets/:id/transfer', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const { newEmployeeId, notes } = req.body;
  if (!newEmployeeId) {
    res.status(400).json({ error: 'newEmployeeId is required.' });
    return;
  }

  const updated = db.transferAsset(req.params.id, newEmployeeId, notes, auth.actor, auth.role);
  if (!updated) {
    res.status(400).json({ error: 'Unable to transfer asset.' });
    return;
  }
  res.json(updated);
});

// --------------------------------------------------------------------------
// Audit Logs & Automation Endpoints
// --------------------------------------------------------------------------
app.get('/api/audit-logs', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const logs = db.getAuditLogs(150);
  res.json({ logs });
});

app.get('/api/automation/status', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  res.json(getSchedulerRuntimeStatus());
});

app.get('/api/automation/asset-reminders', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const personId = req.query.personId as string | undefined;
  const reminders = db.getAssetReturnReminders(personId);
  res.json({ reminders, total: reminders.length });
});

app.get('/api/automation/delivery-logs', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const personId = req.query.personId as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 150;
  const logs = db.getNotificationDeliveryLogs(isNaN(limit) ? 150 : limit, personId);
  res.json({ logs, total: logs.length });
});

app.post('/api/automation/asset-reminders/run', async (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ['HR', 'Co-Founder']);
  if (!auth) return;
  const referenceDate = req.body?.referenceDate as string | undefined;
  const summary = await runAssetReturnReminderSweep({
    referenceDate,
    triggeredBy: `${auth.actor} (${auth.role})`,
  });
  res.json({ success: true, summary });
});

// --------------------------------------------------------------------------
// Upcoming Alerts (Internship Completion, Birthdays & Candidate Missing Docs)
// --------------------------------------------------------------------------
app.get('/api/alerts', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const refDate = req.query.refDate as string | undefined;
  const maxDays = req.query.maxDays ? parseInt(req.query.maxDays as string, 10) : 2;
  const activeOnly = req.query.activeOnly !== 'false';

  const alerts = db.getUpcomingAlerts(refDate, isNaN(maxDays) ? 2 : maxDays, activeOnly);
  const now = refDate ? new Date(refDate) : new Date();

  res.json({
    alerts,
    total: alerts.length,
    referenceDate: now.toISOString().split('T')[0],
    maxDays: isNaN(maxDays) ? 2 : maxDays,
  });
});

app.post('/api/alerts/dismiss', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const { alertId } = req.body;

  if (!alertId) {
    res.status(400).json({ error: 'alertId is required.' });
    return;
  }

  const success = db.dismissAlert(alertId, auth.actor);
  res.json({ success, alertId });
});

app.post('/api/alerts/dismiss-missing-docs', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const candidateId = req.body?.candidateId as string | undefined;
  const result = db.dismissMissingDocumentAlerts(auth.actor, auth.role, candidateId);
  res.json({ success: true, ...result });
});

app.post('/api/alerts/reset-dismissed', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const success = db.resetDismissedAlerts(auth.actor);
  res.json({ success, message: 'Dismissed alerts reset successfully.' });
});

// --------------------------------------------------------------------------
// Spreadsheet Import & Parsing Endpoints
// --------------------------------------------------------------------------
app.post('/api/import/preview', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;
  try {
    const { fileBase64, csvText, targetType } = req.body;
    let workbook: XLSX.WorkBook;

    if (fileBase64) {
      const buffer = Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } else if (csvText) {
      workbook = XLSX.read(csvText, { type: 'string' });
    } else {
      res.status(400).json({ error: 'No file data provided' });
      return;
    }

    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rawRows.length === 0) {
      res.status(400).json({ error: 'Uploaded sheet contains no data rows.' });
      return;
    }

    const headers = Object.keys(rawRows[0]);
    const existingEmployees = db.getEmployees('HR');

    // Smart Column Matching & Mapping
    const previewRows = rawRows.map((row, idx) => {
      const rowNum = idx + 2; // header is row 1
      const mapped: Partial<Employee> = {};
      const validationErrors: string[] = [];

      // Extract Name
      const nameKey = headers.find(h => /name|full\s*name|employee\s*name/i.test(h));
      if (nameKey && row[nameKey]) {
        mapped.fullName = String(row[nameKey]).trim();
      } else {
        validationErrors.push('Missing Name column/value');
      }

      // Extract Code
      const codeKey = headers.find(h => /code|emp\s*id|employee\s*code|emp\s*code/i.test(h));
      if (codeKey && row[codeKey]) {
        mapped.employeeCode = String(row[codeKey]).trim();
      }

      // Extract Email
      const emailKey = headers.find(h => /email|mail/i.test(h));
      if (emailKey && row[emailKey]) {
        mapped.email = String(row[emailKey]).trim();
      }

      // Extract Phone
      const phoneKey = headers.find(h => /phone|mobile|contact|contact\s*no/i.test(h));
      if (phoneKey && row[phoneKey]) {
        mapped.phone = String(row[phoneKey]).trim();
      }

      // Extract Designation
      const desigKey = headers.find(h => /designation|role|job\s*title/i.test(h));
      if (desigKey && row[desigKey]) {
        mapped.designation = String(row[desigKey]).trim();
      }

      // Extract Department
      const deptKey = headers.find(h => /dept|department/i.test(h));
      if (deptKey && row[deptKey]) {
        mapped.department = String(row[deptKey]).trim();
      } else {
        mapped.department = 'Sales & Investments';
      }

      // Extract Joining Date
      const joinKey = headers.find(h => /join|joining\s*date|doj/i.test(h));
      if (joinKey && row[joinKey]) {
        mapped.joiningDate = String(row[joinKey]).trim();
      }

      // Extract DOB
      const dobKey = headers.find(h => /dob|birth|date\s*of\s*birth/i.test(h));
      if (dobKey && row[dobKey]) {
        mapped.dateOfBirth = String(row[dobKey]).trim();
      }

      // Extract Seat / Desk & preserve raw spreadsheet seat
      const seatKey = headers.find(h => /seat|desk|designated\s*seat/i.test(h));
      if (seatKey && row[seatKey]) {
        const rawSeat = String(row[seatKey]).trim();
        mapped.sourceSpreadsheetSeat = rawSeat;
        mapped.desk = mapSpreadsheetSeatToStandardDesk(rawSeat);
      }

      // Extract Internship Completion Date
      const internKey = headers.find(h => /internship\s*com|internship.*completion|intern.*end/i.test(h));
      if (internKey && row[internKey]) {
        mapped.internshipCompletionDate = String(row[internKey]).trim();
      }

      // Extract Banking Details (Account, Bank, IFSC)
      const accKey = headers.find(h => /account\s*no|acc\s*no/i.test(h));
      const bankKey = headers.find(h => /bank.*branch|bank\s*name/i.test(h));
      const ifscKey = headers.find(h => /ifsc/i.test(h));
      if (accKey || bankKey || ifscKey) {
        mapped.bankDetails = {
          accountNo: accKey && row[accKey] ? String(row[accKey]).trim() : undefined,
          bankName: bankKey && row[bankKey] ? String(row[bankKey]).trim() : undefined,
          ifscCode: ifscKey && row[ifscKey] ? String(row[ifscKey]).trim() : undefined,
        };
      }

      // Extract Identity Details (Aadhaar & PAN)
      const aadhaarKey = headers.find(h => /adhar|aadhaar/i.test(h));
      const panKey = headers.find(h => /pan\s*card|pan\s*no/i.test(h));
      if (aadhaarKey || panKey) {
        mapped.identityDetails = {
          aadhaarNo: aadhaarKey && row[aadhaarKey] ? String(row[aadhaarKey]).trim() : undefined,
          panNo: panKey && row[panKey] ? String(row[panKey]).trim() : undefined,
        };
      }

      // Extract Google Drive Folder Link
      const driveKey = headers.find(h => /drive|google\s*drive/i.test(h));
      if (driveKey && row[driveKey]) {
        mapped.googleDriveLink = String(row[driveKey]).trim();
      }

      // Extract Previous CTC & Offered CTC
      const prevCtcKey = headers.find(h => /prev.*ctc|previous\s*ctc|last\s*salary/i.test(h));
      if (prevCtcKey && row[prevCtcKey]) {
        mapped.previousCTC = String(row[prevCtcKey]).trim();
      }

      const offeredCtcKey = headers.find(h => /offered.*ctc|current.*ctc|new\s*ctc|offered\s*salary/i.test(h));
      if (offeredCtcKey && row[offeredCtcKey]) {
        mapped.offeredCTC = String(row[offeredCtcKey]).trim();
      }

      // Extract Manager
      const mgrKey = headers.find(h => /manager|reporting|reporting\s*manager/i.test(h));
      if (mgrKey && row[mgrKey]) {
        mapped.reportingManager = String(row[mgrKey]).trim();
      }

      // Target type classification
      if (targetType === 'candidate') {
        mapped.isCandidate = true;
        mapped.employmentStatus = 'Upcoming Joiner';
      } else {
        mapped.isCandidate = false;
        mapped.employmentStatus = 'Full-Time';
      }

      // Duplicate / Conflict Detection
      let matchStatus: 'New Record' | 'Exact Match' | 'Potential Duplicate' | 'Conflict' = 'New Record';
      let matchedExistingId: string | undefined = undefined;
      let matchedExistingName: string | undefined = undefined;

      const exactMatch = existingEmployees.find(
        e =>
          (mapped.email && e.email.toLowerCase() === mapped.email.toLowerCase()) ||
          (mapped.employeeCode && e.employeeCode.toUpperCase() === mapped.employeeCode.toUpperCase())
      );

      if (exactMatch) {
        matchStatus = 'Exact Match';
        matchedExistingId = exactMatch.id;
        matchedExistingName = exactMatch.fullName;
      } else {
        const potentialDup = existingEmployees.find(
          e =>
            (mapped.phone && e.phone.replace(/\D/g, '') === mapped.phone.replace(/\D/g, '')) ||
            (mapped.fullName && e.fullName.toLowerCase() === mapped.fullName.toLowerCase())
        );
        if (potentialDup) {
          matchStatus = 'Potential Duplicate';
          matchedExistingId = potentialDup.id;
          matchedExistingName = potentialDup.fullName;
        }
      }

      return {
        rowNumber: rowNum,
        raw: row,
        mapped,
        matchStatus,
        matchedExistingId,
        matchedExistingName,
        validationErrors,
      };
    });

    res.json({
      sheetName: firstSheetName,
      totalRows: previewRows.length,
      headers,
      preview: previewRows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse file';
    res.status(500).json({ error: message });
  }
});

app.post('/api/import/commit', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, OPERATIONAL_ROLES);
  if (!auth) return;

  const { rows, mode } = req.body;
  if (!rows || !Array.isArray(rows)) {
    res.status(400).json({ error: 'Invalid rows array provided.' });
    return;
  }

  const summary = db.commitImportedRecords(rows, mode || 'merge', auth.actor, auth.role);
  res.json(summary);
});

// --------------------------------------------------------------------------
// Backup & Export (JSON & Excel)
// --------------------------------------------------------------------------
app.get('/api/export/backup', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ['HR', 'Co-Founder']);
  if (!auth) return;
  const rawData = db.getRawData();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=WhiteCollarRealty_HR_Backup_${Date.now()}.json`);
  res.send(JSON.stringify(rawData, null, 2));
});

// Single-sheet Excel export (1 row per person, sorted alphabetically)
app.get('/api/export/excel/single-sheet', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const data = db.generateSingleSheetExportData(auth.role);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Master Personnel Directory');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=WhiteCollarRealty_Master_Directory_SingleSheet_${Date.now()}.xlsx`);
  res.send(buf);
});

app.get('/api/export/excel', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ALL_ROLES);
  if (!auth) return;
  const { role } = auth;
  if (req.query.format === 'single' || req.query.format === 'single-sheet') {
    const data = db.generateSingleSheetExportData(role);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Master Personnel Directory');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=WhiteCollarRealty_Master_Directory_SingleSheet_${Date.now()}.xlsx`);
    res.send(buf);
    return;
  }
  const employees = db.getEmployees(role);
  const activeEmployees = employees.filter(e => !e.isCandidate);
  const candidates = employees.filter(e => e.isCandidate);
  const desks = db.getDesks();
  const assets = db.getAssets();
  const logs = db.getAuditLogs(200);

  const wb = XLSX.utils.book_new();

  // Sheet 1: Active Employees
  const empSheetData = activeEmployees.map(e => ({
    'Employee Code': e.employeeCode,
    'Full Name': e.fullName,
    'Official Email': e.email,
    'Contact Phone': e.phone,
    'Designation': e.designation,
    'Department': e.department,
    'Reporting Manager': e.reportingManager,
    'Joining Date': e.joiningDate,
    'Date of Birth': e.dateOfBirth,
    'Designated Desk': e.desk || 'Unassigned',
    'Employment Status': e.employmentStatus,
    'Market Focus': e.market,
    'Previous Company': e.previousCompany || '',
    'Previous CTC': e.previousCTC || '',
    'Current CTC': e.offeredCTC || '',
    'Profile Completion %': e.profileCompletion,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empSheetData), 'Employees Directory');

  // Sheet 2: Upcoming Joiners / Candidates
  const candSheetData = candidates.map(c => ({
    'Candidate ID / Code': c.employeeCode,
    'Full Name': c.fullName,
    'Email': c.email,
    'Phone': c.phone,
    'Target Designation': c.designation,
    'Department': c.department,
    'Expected Joining Date': c.joiningDate,
    'Candidate Onboarding Status': c.candidateStatus || 'Offer Accepted',
    'Allocated Desk': c.desk || 'Unassigned',
    'Previous CTC': c.previousCTC || '',
    'Offered CTC': c.offeredCTC || '',
    'Onboarding Completion %': c.profileCompletion,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(candSheetData), 'Upcoming Candidates');

  // Sheet 3: Desk Allocations (A1-H5)
  const deskSheetData = desks.map(d => ({
    'Desk Code': d.code,
    'Office Bay': d.bay,
    'Status': d.status,
    'Occupant Name': d.assignedEmployeeName || '—',
    'Employee Code': d.assignedEmployeeCode || '—',
    'Department': d.assignedEmployeeDepartment || '—',
    'Designation': d.assignedEmployeeDesignation || '—',
    'Is Candidate Reserved': d.isUpcoming ? 'Yes' : 'No',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deskSheetData), 'Desk Allocation');

  // Sheet 4: Company Assets & Inventory
  const assetSheetData = assets.map(a => ({
    'Asset Tag': a.assetTag,
    'Asset Name / Model': a.name,
    'Category': a.type,
    'Serial Number': a.serialNumber || '—',
    'Status': a.status,
    'Condition': a.condition,
    'Assigned To': a.assignedEmployeeName || 'Unassigned',
    'Employee Code': a.assignedEmployeeCode || '—',
    'Issue Date': a.issueDate || '—',
    'Expected Return Date': a.expectedReturnDate || '—',
    'Return Date': a.returnDate || '—',
    'Notes': a.notes || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assetSheetData), 'Company Assets');

  // Sheet 5: Audit Log
  const logSheetData = logs.map(l => ({
    'Timestamp': l.timestamp,
    'Actor': l.actor,
    'Role': l.actorRole,
    'Action': l.action,
    'Entity Type': l.entityType,
    'Target Name': l.entityName,
    'Details': l.details,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logSheetData), 'Audit Trail');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=WhiteCollarRealty_HR_Master_${Date.now()}.xlsx`);
  res.send(buf);
});

// Database reset endpoint
app.post('/api/database/reset', (req: Request, res: Response) => {
  const auth = authenticateRequest(req, res, ['HR', 'Co-Founder']);
  if (!auth) return;
  db.resetToSeed(auth.actor, auth.role);
  res.json({ success: true, message: 'Database reset to original seed data.' });
});

// --------------------------------------------------------------------------
// Vite integration for dev server or static files in production
// --------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  startAutomationScheduler();

  const lanIp = getLocalLanIpv4();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] White Collar Realty HR System running at http://localhost:${PORT}`);
    console.log(`[SERVER] Available on local network at http://${lanIp || '127.0.0.1'}:${PORT}`);
  });

  // Secondary port listener on 3000: guarantees 100% compatibility with preview environments without port conflict
  if (PORT !== 3000) {
    try {
      const secondaryServer = app.listen(3000, '0.0.0.0', () => {
        console.log(`[SERVER] Preview compatibility listener active at http://0.0.0.0:3000`);
      });
      secondaryServer.on('error', (err: any) => {
        // Port 3000 may be busy or skipped in local environments; ignore gracefully
        console.log(`[SERVER] Port 3000 preview fallback skipped (${err.message})`);
      });
    } catch {
      // Ignore
    }
  }
}

startServer().catch(err => {
  console.error('[SERVER] Failed to start:', err);
  process.exit(1);
});
