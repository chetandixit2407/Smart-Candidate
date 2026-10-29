import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { db } from './server/database.ts';
import type { UserRole, Employee, CompanyAsset } from './src/types/index.ts';
import { ALL_DESK_CODES, mapSpreadsheetSeatToStandardDesk } from './server/seedData.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to extract actor and role from headers
function getAuthContext(req: Request): { actor: string; role: UserRole } {
  const roleHeader = (req.headers['x-user-role'] as string) || 'HR_ADMIN';
  const nameHeader = (req.headers['x-user-name'] as string) || 'Simran Kaur (HR Head)';
  
  let validRole: UserRole = 'HR_ADMIN';
  if (roleHeader === 'HR_MANAGER' || roleHeader === 'DEPT_HEAD_VIEWER') {
    validRole = roleHeader;
  }
  return { actor: nameHeader, role: validRole };
}

// --------------------------------------------------------------------------
// Real-Time Server-Sent Events (SSE) Bus
// --------------------------------------------------------------------------
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  db.addSSEClient(res);

  // Send initial connection packet
  res.write(`event: CONNECTED\ndata: ${JSON.stringify({ status: 'connected', time: new Date().toISOString() })}\n\n`);
});

// --------------------------------------------------------------------------
// Current User / Auth Status
// --------------------------------------------------------------------------
app.get('/api/auth/me', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  res.json({
    user: {
      id: 'usr-current',
      name: actor,
      email: role === 'DEPT_HEAD_VIEWER' ? 'viewer@whitecollarrealty.com' : 'hr@whitecollarrealty.com',
      role,
      department: role === 'DEPT_HEAD_VIEWER' ? 'Sales Management' : 'People Operations & HR',
    },
  });
});

// --------------------------------------------------------------------------
// Dashboard Statistics & KPI Metrics
// --------------------------------------------------------------------------
app.get('/api/stats', (req: Request, res: Response) => {
  const { role } = getAuthContext(req);
  const allEmployees = db.getEmployees(role);
  const activeEmployees = allEmployees.filter(e => !e.isCandidate);
  const candidates = allEmployees.filter(e => e.isCandidate);
  const desks = db.getDesks();
  const assets = db.getAssets();

  // Calculate pending documents
  let pendingDocsCount = 0;
  allEmployees.forEach(e => {
    if (e.documents) {
      Object.values(e.documents).forEach(d => {
        if (d.required && (d.status === 'Not Submitted' || d.status === 'Under Review' || d.status === 'Rejected')) {
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

  res.json({
    totalEmployees: activeEmployees.length,
    upcomingJoiners: candidates.length,
    pendingDocuments: pendingDocsCount,
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
// Employees & Candidates Endpoints
// --------------------------------------------------------------------------
app.get('/api/employees', (req: Request, res: Response) => {
  const { role } = getAuthContext(req);
  const isCandidateQuery = req.query.isCandidate;
  const search = req.query.search as string;
  const department = req.query.department as string;

  let isCandidate: boolean | undefined = undefined;
  if (isCandidateQuery === 'true') isCandidate = true;
  if (isCandidateQuery === 'false') isCandidate = false;

  const list = db.getEmployees(role, { isCandidate, search, department });
  res.json({ employees: list, total: list.length });
});

app.get('/api/employees/:id', (req: Request, res: Response) => {
  const { role } = getAuthContext(req);
  const emp = db.getEmployeeById(req.params.id, role);
  if (!emp) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(emp);
});

app.post('/api/employees', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot create records.' });
    return;
  }

  const created = db.createEmployee(req.body, actor, role);
  res.status(201).json(created);
});

app.put('/api/employees/:id', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot modify records.' });
    return;
  }

  const updated = db.updateEmployee(req.params.id, req.body, actor, role);
  if (!updated) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(updated);
});

app.delete('/api/employees/:id', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role !== 'HR_ADMIN') {
    res.status(403).json({ error: 'Permission denied: Only HR Admin can delete records.' });
    return;
  }

  const deleted = db.deleteEmployee(req.params.id, actor, role);
  if (!deleted) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json({ success: true, message: 'Record deleted successfully.' });
});

app.post('/api/candidates/:id/convert', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot convert candidates.' });
    return;
  }

  const converted = db.convertCandidateToEmployee(req.params.id, req.body, actor, role);
  if (!converted) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }
  res.json(converted);
});

// Document verification status endpoint
app.put('/api/employees/:id/documents/:docKey', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot verify documents.' });
    return;
  }

  const { status, reviewNotes, verifiedBy, fileName, fileSize, fileData, mimeType } = req.body;
  if (!status) {
    res.status(400).json({ error: 'Document status is required' });
    return;
  }

  const updated = db.updateDocument(
    req.params.id,
    req.params.docKey,
    { status, reviewNotes, verifiedBy, fileName, fileSize, fileData, mimeType },
    actor,
    role
  );

  if (!updated) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(updated);
});

// Direct file upload for document
app.post('/api/employees/:id/documents/:docKey/upload', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot upload documents.' });
    return;
  }

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
    actor,
    role
  );

  if (!updated) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json(updated);
});

// Candidate one-time upload link management
app.post('/api/candidates/:id/upload-link/generate', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot generate upload links.' });
    return;
  }

  const result = db.generateUploadToken(req.params.id, actor, role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/candidates/:id/upload-link/revoke', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot revoke upload links.' });
    return;
  }

  const result = db.revokeUploadToken(req.params.id, actor, role);
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
// Desk Allocation Endpoints
// --------------------------------------------------------------------------
app.get('/api/desks', (req: Request, res: Response) => {
  const desks = db.getDesks();
  res.json({ desks, total: desks.length, allowedDesks: ALL_DESK_CODES });
});

app.post('/api/desks/assign', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot allocate desks.' });
    return;
  }

  const { deskCode, employeeId } = req.body;
  if (!deskCode || !employeeId) {
    res.status(400).json({ error: 'Both deskCode and employeeId are required.' });
    return;
  }

  const result = db.assignDesk(deskCode, employeeId, actor, role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post('/api/desks/release', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot release desks.' });
    return;
  }

  const { deskCode } = req.body;
  if (!deskCode) {
    res.status(400).json({ error: 'deskCode is required.' });
    return;
  }

  const result = db.releaseDesk(deskCode, actor, role);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

// --------------------------------------------------------------------------
// Company Assets & Inventory Endpoints
// --------------------------------------------------------------------------
app.get('/api/assets', (req: Request, res: Response) => {
  const assets = db.getAssets();
  res.json({ assets, total: assets.length });
});

app.get('/api/assets/:id', (req: Request, res: Response) => {
  const asset = db.getAssetById(req.params.id);
  if (!asset) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  res.json(asset);
});

app.post('/api/assets', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot create assets.' });
    return;
  }

  const created = db.createAsset(req.body, actor, role);
  res.status(201).json(created);
});

app.put('/api/assets/:id', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot edit assets.' });
    return;
  }

  const updated = db.updateAsset(req.params.id, req.body, actor, role);
  if (!updated) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  res.json(updated);
});

app.post('/api/assets/:id/issue', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied' });
    return;
  }

  const { employeeId, issueDate, notes } = req.body;
  if (!employeeId) {
    res.status(400).json({ error: 'employeeId is required.' });
    return;
  }

  const updated = db.issueAsset(req.params.id, employeeId, issueDate, notes, actor, role);
  if (!updated) {
    res.status(400).json({ error: 'Unable to issue asset. Verify asset and employee exist.' });
    return;
  }
  res.json(updated);
});

app.post('/api/assets/:id/return', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied' });
    return;
  }

  const { returnDate, condition, notes } = req.body;
  const updated = db.returnAsset(req.params.id, returnDate, condition, notes, actor, role);
  if (!updated) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  res.json(updated);
});

app.post('/api/assets/:id/transfer', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied' });
    return;
  }

  const { newEmployeeId, notes } = req.body;
  if (!newEmployeeId) {
    res.status(400).json({ error: 'newEmployeeId is required.' });
    return;
  }

  const updated = db.transferAsset(req.params.id, newEmployeeId, notes, actor, role);
  if (!updated) {
    res.status(400).json({ error: 'Unable to transfer asset.' });
    return;
  }
  res.json(updated);
});

// --------------------------------------------------------------------------
// Audit Logs
// --------------------------------------------------------------------------
app.get('/api/audit-logs', (req: Request, res: Response) => {
  const logs = db.getAuditLogs(100);
  res.json({ logs });
});

// --------------------------------------------------------------------------
// Upcoming Alerts (Internship Completion & Employee Birthdays)
// --------------------------------------------------------------------------
app.get('/api/alerts', (req: Request, res: Response) => {
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
  const { actor } = getAuthContext(req);
  const { alertId } = req.body;

  if (!alertId) {
    res.status(400).json({ error: 'alertId is required.' });
    return;
  }

  const success = db.dismissAlert(alertId, actor);
  res.json({ success, alertId });
});

app.post('/api/alerts/reset-dismissed', (req: Request, res: Response) => {
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot reset alerts.' });
    return;
  }

  const success = db.resetDismissedAlerts(actor);
  res.json({ success, message: 'Dismissed alerts reset successfully.' });
});

// --------------------------------------------------------------------------
// Spreadsheet Import & Parsing Endpoints
// --------------------------------------------------------------------------
app.post('/api/import/preview', (req: Request, res: Response) => {
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
    const existingEmployees = db.getEmployees('HR_ADMIN');

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
  const { actor, role } = getAuthContext(req);
  if (role === 'DEPT_HEAD_VIEWER') {
    res.status(403).json({ error: 'Permission denied: Viewers cannot import records.' });
    return;
  }

  const { rows, mode } = req.body;
  if (!rows || !Array.isArray(rows)) {
    res.status(400).json({ error: 'Invalid rows array provided.' });
    return;
  }

  const summary = db.commitImportedRecords(rows, mode || 'merge', actor, role);
  res.json(summary);
});

// --------------------------------------------------------------------------
// Backup & Export (JSON & Excel)
// --------------------------------------------------------------------------
app.get('/api/export/backup', (req: Request, res: Response) => {
  const rawData = db.getRawData();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=WhiteCollarRealty_HR_Backup_${Date.now()}.json`);
  res.send(JSON.stringify(rawData, null, 2));
});

// Requirement 5: Single-sheet Excel export (1 row per person, sorted alphabetically)
app.get('/api/export/excel/single-sheet', (req: Request, res: Response) => {
  const { role } = getAuthContext(req);
  const data = db.generateSingleSheetExportData(role);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Master Personnel Directory');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=WhiteCollarRealty_Master_Directory_SingleSheet_${Date.now()}.xlsx`);
  res.send(buf);
});

app.get('/api/export/excel', (req: Request, res: Response) => {
  const { role } = getAuthContext(req);
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
  const { actor, role } = getAuthContext(req);
  if (role !== 'HR_ADMIN') {
    res.status(403).json({ error: 'Permission denied: Only HR Admin can reset the database.' });
    return;
  }
  db.resetToSeed(actor, role);
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] White Collar Realty HR System running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[SERVER] Failed to start:', err);
  process.exit(1);
});
