import React, { useState } from 'react';
import {
  X,
  Download,
  CheckCircle2,
  AlertCircle,
  FileText,
  Lock,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Calendar,
  UserCheck,
  UploadCloud,
  FileCheck,
} from 'lucide-react';
import { DocumentRecord, DocumentStatus, UserRole } from '../types/index.js';

interface LiveDocumentViewerModalProps {
  document: DocumentRecord;
  employeeName: string;
  employeeId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (docKey: string, status: DocumentStatus, notes: string) => Promise<void>;
  onUploadFile?: (docKey: string, fileData: string, fileName: string, fileSize: string, mimeType: string) => Promise<void>;
  userRole: UserRole;
  currentUserName: string;
}

export const LiveDocumentViewerModal: React.FC<LiveDocumentViewerModalProps> = ({
  document,
  employeeName,
  employeeId,
  isOpen,
  onClose,
  onUpdateStatus,
  onUploadFile,
  userRole,
  currentUserName,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<DocumentStatus>(document.status);
  const [reviewNotes, setReviewNotes] = useState<string>(document.reviewNotes || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  if (!isOpen) return null;

  const isViewer = userRole === 'DEPT_HEAD_VIEWER';

  // Determine file preview URL or fallback
  const fileUrl = document.fileData || (document.fileName?.toLowerCase().includes('information') || document.fileName?.toLowerCase().includes('sheet')
    ? '/assets/aistudio/Chetan_Information_Sheet_-_Sheet1_06bd8f64.pdf'
    : document.fileName?.toLowerCase().includes('aadhaar') || document.fileName?.toLowerCase().includes('pan')
    ? '/assets/aistudio/Employees_Details__Birthday___-_Sheet1_8b0b9282.pdf'
    : null);

  const isImage = document.mimeType?.startsWith('image/') ||
    (document.fileName && /\.(png|jpe?g|webp|gif)$/i.test(document.fileName));

  const isPdf = !isImage;

  const handleSaveStatus = async () => {
    try {
      setSaving(true);
      setMsg(null);
      await onUpdateStatus(document.key, selectedStatus, reviewNotes);
      setMsg({ type: 'success', text: `Status updated to ${selectedStatus}` });
      setTimeout(() => setMsg(null), 3000);
    } catch (err: unknown) {
      const errorText = err instanceof Error ? err.message : 'Failed to update status';
      setMsg({ type: 'error', text: errorText });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadFile) return;

    if (file.size > 15 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'File size exceeds 15MB limit.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setUploading(true);
        setMsg(null);
        const base64 = reader.result as string;
        const sizeStr = file.size < 1024 * 1024
          ? `${Math.round(file.size / 1024)} KB`
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

        await onUploadFile(document.key, base64, file.name, sizeStr, file.type || 'application/pdf');
        setMsg({ type: 'success', text: 'New file uploaded successfully.' });
      } catch (err: unknown) {
        const errorText = err instanceof Error ? err.message : 'Failed to upload document file';
        setMsg({ type: 'error', text: errorText });
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 sm:p-5">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Top Header */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white truncate tracking-tight">
                  {document.title}
                </h3>
                <span className="text-[11px] font-mono text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-400/30">
                  {document.category}
                </span>
                {document.required && (
                  <span className="text-[10px] text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/30">
                    Mandatory
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 truncate mt-0.5">
                Personnel: <strong>{employeeName}</strong> · File: <span className="font-mono text-slate-200">{document.fileName || 'No file attached'}</span> ({document.fileSize || '1.2 MB'})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {fileUrl && (
              <a
                href={fileUrl}
                download={document.fileName || `${document.key}.pdf`}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border border-slate-700"
                title="Download this document securely"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span>
              </a>
            )}

            {!isViewer && onUploadFile && (
              <label className="cursor-pointer px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border border-slate-700">
                <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">{uploading ? 'Uploading...' : 'Replace File'}</span>
                <input
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/jpg"
                  className="hidden"
                  disabled={uploading}
                  onChange={handleFileUpload}
                />
              </label>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Notification */}
        {msg && (
          <div
            className={`px-6 py-2 text-xs flex items-center gap-2 ${
              msg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-b border-rose-200'
            }`}
          >
            {msg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{msg.text}</span>
          </div>
        )}

        {/* Content Body: Preview on Left/Center, Review controls on Right */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-slate-100">
          {/* Document Preview Stage */}
          <div className="flex-1 relative bg-slate-900 flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden min-h-[380px]">
            {fileUrl ? (
              isImage ? (
                <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                  <img
                    src={fileUrl}
                    alt={document.title}
                    style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center' }}
                    className="max-h-[68vh] max-w-full object-contain rounded shadow-2xl transition-transform"
                  />
                </div>
              ) : (
                <iframe
                  src={`${fileUrl}#toolbar=0`}
                  title={document.title}
                  className="w-full h-full min-h-[480px] rounded-lg border border-slate-700 bg-white"
                />
              )
            ) : (
              <div className="p-8 text-center space-y-3">
                <FileText className="w-14 h-14 text-slate-600 mx-auto" />
                <div>
                  <p className="text-sm font-semibold text-slate-300">No document preview available yet</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Candidate or HR has not uploaded a digital copy of this file. Use the button above to upload a PDF or image.
                  </p>
                </div>
              </div>
            )}

            {/* Floating Image Zoom Bar */}
            {isImage && fileUrl && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700 flex items-center gap-2 text-white text-xs shadow-lg">
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.max(50, prev - 25))}
                  className="p-1 hover:text-amber-400"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[11px] w-12 text-center">{zoomLevel}%</span>
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.min(250, prev + 25))}
                  className="p-1 hover:text-amber-400"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(100)}
                  className="p-1 hover:text-amber-400 ml-1 text-[11px]"
                  title="Reset Zoom"
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          {/* Compliance & Verification Panel */}
          <div className="w-full lg:w-80 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 p-5 space-y-5 overflow-y-auto shrink-0">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Compliance Verification
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Audit and mark document validity according to White Collar Realty standards.
              </p>
            </div>

            {/* Current Status Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Verification Status
              </label>
              {!isViewer ? (
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value as DocumentStatus)}
                  className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-900"
                >
                  <option value="Verified">Verified (Compliant)</option>
                  <option value="Under Review">Under Review (Inspection in progress)</option>
                  <option value="Submitted">Submitted (Needs HR inspection)</option>
                  <option value="Not Submitted">Not Submitted</option>
                  <option value="Missing">Missing</option>
                  <option value="Rejected">Rejected (Illegible / Mismatch)</option>
                  <option value="Not Applicable">Not Applicable</option>
                </select>
              ) : (
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 font-semibold text-xs text-slate-800">
                  {document.status}
                </div>
              )}
            </div>

            {/* Reviewer Audit Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Reviewer / Compliance Notes
              </label>
              {!isViewer ? (
                <textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder="e.g. Verified Aadhaar number matches DOB and name. Approved."
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900 bg-slate-50 focus:bg-white leading-relaxed"
                />
              ) : (
                <p className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  {document.reviewNotes || 'No audit notes entered.'}
                </p>
              )}
            </div>

            {/* Audit Metadata */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-[11px] text-slate-600 font-mono">
              <div className="flex items-center justify-between">
                <span>Verified By:</span>
                <strong className="text-slate-800 font-sans">{document.verifiedBy || 'Pending'}</strong>
              </div>
              {document.verifiedAt && (
                <div className="flex items-center justify-between">
                  <span>Verified Date:</span>
                  <strong className="text-slate-800">{new Date(document.verifiedAt).toLocaleDateString()}</strong>
                </div>
              )}
              {document.uploadedAt && (
                <div className="flex items-center justify-between">
                  <span>Uploaded At:</span>
                  <strong className="text-slate-800">{new Date(document.uploadedAt).toLocaleDateString()}</strong>
                </div>
              )}
            </div>

            {/* Action Button */}
            {!isViewer && (
              <button
                type="button"
                onClick={handleSaveStatus}
                disabled={saving}
                className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Status...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4 text-amber-400" />
                    <span>Save Verification Status</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
