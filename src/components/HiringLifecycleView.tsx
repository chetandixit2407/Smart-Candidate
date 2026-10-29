import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Calendar,
  Clock,
  Star,
  CheckCircle2,
  FileText,
  UserCheck,
  Send,
  Share2,
  AlertCircle,
  Briefcase,
  ChevronRight,
  Filter,
  ExternalLink,
  MapPin,
  Building,
  Phone,
  Mail,
  MoreVertical,
  X,
  Award,
} from 'lucide-react';
import { Employee, InterviewRound, UserRole, OfferLetterData } from '../types/index.js';

interface HiringLifecycleViewProps {
  candidates: Employee[];
  userRole: UserRole;
  onSelectCandidate: (candidate: Employee) => void;
  onOpenAddModal: () => void;
  onOpenOfferModal: (candidate: Employee) => void;
  onOpenUploadLinkModal: (candidate: Employee) => void;
  onConvertCandidate: (id: string, params: { employeeCode?: string; joiningDate?: string; desk?: string }) => Promise<void>;
  onScheduleInterview: (candidateId: string, data: Partial<InterviewRound>) => Promise<void>;
  onUpdateInterview: (candidateId: string, roundId: string, data: Partial<InterviewRound>) => Promise<void>;
}

export const HiringLifecycleView: React.FC<HiringLifecycleViewProps> = ({
  candidates,
  userRole,
  onSelectCandidate,
  onOpenAddModal,
  onOpenOfferModal,
  onOpenUploadLinkModal,
  onConvertCandidate,
  onScheduleInterview,
  onUpdateInterview,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedStage, setSelectedStage] = useState('All');
  const [activeTab, setActiveTab] = useState<'pipeline' | 'interviews' | 'offers'>('pipeline');

  // Modals for interview scheduling / evaluation
  const [interviewCandidate, setInterviewCandidate] = useState<Employee | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingRound, setEditingRound] = useState<InterviewRound | null>(null);
  const [showEvalModal, setShowEvalModal] = useState(false);

  // Form states for scheduling
  const [roundName, setRoundName] = useState('HR Screening Round');
  const [interviewer, setInterviewer] = useState('Simran Kaur (HR Head)');
  const [interviewDate, setInterviewDate] = useState(new Date().toISOString().split('T')[0]);
  const [interviewTime, setInterviewTime] = useState('11:30 AM');
  const [interviewMode, setInterviewMode] = useState<'In-Person' | 'Google Meet' | 'Phone Call'>('Google Meet');
  const [meetingLink, setMeetingLink] = useState('https://meet.google.com/wcr-hire-demo');

  // Form states for evaluation
  const [evalRating, setEvalRating] = useState<number>(4);
  const [evalFeedback, setEvalFeedback] = useState('Excellent domain knowledge of Gurgaon luxury real estate.');
  const [evalRecommendation, setEvalRecommendation] = useState<'Strong Hire' | 'Hire' | 'Hold' | 'Reject' | 'Proceed to Next Round'>('Hire');

  const departments = ['All', 'Sales', 'Business Development', 'Operations', 'Marketing', 'Legal & Compliance', 'Finance'];
  const stages = ['All', 'Screening', 'Interviewing', 'Selected', 'Offer Extended', 'Offer Accepted', 'Joining Confirmed'];

  // Categorize candidates by stage
  const getCandidateStage = (c: Employee): string => {
    if (c.lifecycleStage) {
      if (c.lifecycleStage === 'Offer Accepted') return 'Offer Accepted';
      if (c.lifecycleStage === 'Offer Extended') return 'Offer Extended';
      if (c.lifecycleStage === 'Selected') return 'Selected';
      if (c.lifecycleStage === 'Interview') return 'Interviewing';
      if (c.lifecycleStage === 'Joining Confirmed') return 'Joining Confirmed';
    }
    if (c.candidateStatus === 'Joining Confirmed') return 'Joining Confirmed';
    if (c.candidateStatus === 'Offer Accepted') return 'Offer Accepted';
    if (c.candidateStatus === 'Offer Extended') return 'Offer Extended';
    if (c.interviews && c.interviews.length > 0) return 'Interviewing';
    return 'Screening';
  };

  const filteredCandidates = candidates.filter(c => {
    const stage = getCandidateStage(c);
    const matchesSearch =
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.designation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = selectedDept === 'All' || c.department === selectedDept;
    const matchesStage = selectedStage === 'All' || stage === selectedStage;
    return matchesSearch && matchesDept && matchesStage;
  });

  const handleOpenSchedule = (c: Employee, round?: InterviewRound) => {
    setInterviewCandidate(c);
    if (round) {
      setEditingRound(round);
      setRoundName(round.roundName);
      setInterviewer(round.interviewer);
      setInterviewDate(round.scheduledDate);
      setInterviewTime(round.scheduledTime || '11:30 AM');
      setInterviewMode(round.mode);
      setMeetingLink(round.meetingLink || '');
    } else {
      setEditingRound(null);
      const nextNum = (c.interviews?.length || 0) + 1;
      setRoundName(nextNum === 1 ? 'Round 1: HR & Cultural Screening' : nextNum === 2 ? 'Round 2: Real Estate Pitch & Market Acumen' : `Round ${nextNum}: Executive Leadership Round`);
      setInterviewer('Simran Kaur (HR Head)');
      setInterviewDate(new Date().toISOString().split('T')[0]);
      setInterviewTime('02:00 PM');
      setInterviewMode('Google Meet');
      setMeetingLink('https://meet.google.com/wcr-hire-eval');
    }
    setShowScheduleModal(true);
  };

  const handleSaveInterviewSchedule = async () => {
    if (!interviewCandidate) return;
    try {
      if (editingRound) {
        await onUpdateInterview(interviewCandidate.id, editingRound.id, {
          roundName,
          interviewer,
          scheduledDate: interviewDate,
          scheduledTime: interviewTime,
          mode: interviewMode,
          meetingLink,
          status: 'Scheduled',
        });
      } else {
        await onScheduleInterview(interviewCandidate.id, {
          roundName,
          interviewer,
          scheduledDate: interviewDate,
          scheduledTime: interviewTime,
          mode: interviewMode,
          meetingLink,
          status: 'Scheduled',
        });
      }
      setShowScheduleModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenEval = (c: Employee, round: InterviewRound) => {
    setInterviewCandidate(c);
    setEditingRound(round);
    setEvalRating(round.rating || 4);
    setEvalFeedback(round.feedback || 'Demonstrated outstanding aptitude for client handling.');
    setEvalRecommendation(round.recommendation || 'Hire');
    setShowEvalModal(true);
  };

  const handleSaveEval = async () => {
    if (!interviewCandidate || !editingRound) return;
    try {
      await onUpdateInterview(interviewCandidate.id, editingRound.id, {
        status: 'Completed',
        rating: evalRating,
        feedback: evalFeedback,
        recommendation: evalRecommendation,
        completedAt: new Date().toISOString(),
      });
      setShowEvalModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Pipeline summary counts
  const countScreening = candidates.filter(c => getCandidateStage(c) === 'Screening').length;
  const countInterviewing = candidates.filter(c => getCandidateStage(c) === 'Interviewing').length;
  const countSelected = candidates.filter(c => getCandidateStage(c) === 'Selected').length;
  const countOffer = candidates.filter(c => getCandidateStage(c) === 'Offer Extended' || getCandidateStage(c) === 'Offer Accepted').length;
  const countConfirmed = candidates.filter(c => getCandidateStage(c) === 'Joining Confirmed').length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Summary */}
      <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              White Collar Realty · Talent Acquisition
            </span>
            <span className="text-xs text-slate-400">· Gurugram & Dubai Expansion</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-1">
            End-to-End Hiring & Recruitment Pipeline
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Manage candidate sourcing, multi-round interview evaluations, executive offer letter issuance, document verification, and joining confirmation.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {userRole !== 'DEPT_HEAD_VIEWER' && (
            <button
              type="button"
              onClick={onOpenAddModal}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Enroll Candidate
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">1. Sourced / Applied</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-slate-900">{countScreening}</span>
            <span className="text-xs font-medium text-slate-400">Screening</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/20 shadow-2xs">
          <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider block">2. In Interviews</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-purple-900">{countInterviewing}</span>
            <span className="text-xs font-medium text-purple-600">Active Rounds</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">3. Evaluated & Selected</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-amber-900">{countSelected}</span>
            <span className="text-xs font-medium text-amber-600">Offer Prep</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-2xs">
          <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">4. Offers Dispatched</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-blue-900">{countOffer}</span>
            <span className="text-xs font-medium text-blue-600">Issued / Accepted</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">5. Joining Confirmed</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-emerald-900">{countConfirmed}</span>
            <span className="text-xs font-medium text-emerald-600">Day 1 Ready</span>
          </div>
        </div>
      </div>

      {/* Filter and Tab Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search candidate by name, role, email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="w-3.5 h-3.5" />
              <span>Dept:</span>
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium"
              >
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Stage:</span>
              <select
                value={selectedStage}
                onChange={e => setSelectedStage(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium"
              >
                {stages.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Candidate Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCandidates.map(candidate => {
          const stage = getCandidateStage(candidate);
          const interviews = candidate.interviews || [];
          const hasOffer = Boolean(candidate.offerLetter);
          const docsCount = Object.keys(candidate.documents || {}).length;
          const verifiedDocs = Object.values(candidate.documents || {}).filter(d => d.status === 'Verified').length;

          return (
            <div
              key={candidate.id}
              className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all hover:shadow-md flex flex-col justify-between overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-slate-900 text-amber-400 font-bold text-sm flex items-center justify-center shrink-0">
                      {candidate.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelectCandidate(candidate)}
                        className="font-bold text-sm text-slate-900 hover:text-amber-600 transition-colors truncate block text-left"
                      >
                        {candidate.fullName}
                      </button>
                      <p className="text-xs text-slate-500 truncate">
                        {candidate.designation} · {candidate.department}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                      stage === 'Joining Confirmed'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : stage === 'Offer Accepted'
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : stage === 'Offer Extended'
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : stage === 'Selected'
                        ? 'bg-purple-50 text-purple-700 border-purple-300'
                        : stage === 'Interviewing'
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {stage}
                  </span>
                </div>

                {/* Candidate Quick Info */}
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Market & Location:</span>
                    <strong className="text-slate-800">{candidate.market}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Offered CTC:</span>
                    <strong className="text-slate-900 font-mono">{candidate.offeredCTC || 'To be calculated'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Target Joining:</span>
                    <span className="text-slate-800 font-mono">{candidate.joiningDate || 'Pending'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Doc Verification:</span>
                    <span className="font-mono text-emerald-700 font-bold">{verifiedDocs} / {docsCount} Verified</span>
                  </div>
                </div>

                {/* Interview Rounds Strip */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-700">Interview Rounds ({interviews.length}):</span>
                    {userRole !== 'DEPT_HEAD_VIEWER' && (
                      <button
                        type="button"
                        onClick={() => handleOpenSchedule(candidate)}
                        className="text-amber-700 hover:text-amber-800 font-medium hover:underline text-[10px] flex items-center gap-0.5"
                      >
                        + Add Round
                      </button>
                    )}
                  </div>

                  {interviews.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic bg-slate-50 p-2 rounded border border-slate-100 text-center">
                      No interview rounds scheduled yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {interviews.map((rnd, idx) => (
                        <div
                          key={rnd.id || idx}
                          className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200 text-xs"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-[11px] text-slate-800 truncate">{rnd.roundName}</span>
                              {rnd.rating && (
                                <span className="flex items-center text-amber-600 font-bold text-[10px]">
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-500 mr-0.5" />
                                  {rnd.rating}/5
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {rnd.scheduledDate} · {rnd.interviewer} ({rnd.mode})
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {rnd.status === 'Scheduled' && userRole !== 'DEPT_HEAD_VIEWER' && (
                              <button
                                type="button"
                                onClick={() => handleOpenEval(candidate, rnd)}
                                className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-[10px] font-semibold"
                                title="Record evaluation rating & recommendation"
                              >
                                Score
                              </button>
                            )}
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                                rnd.status === 'Completed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {rnd.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Offer Letter Status Badge */}
                {hasOffer && (
                  <div className="bg-amber-50/70 border border-amber-200 p-2 rounded-lg flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="font-semibold text-slate-800 truncate">
                        Offer: {candidate.offerLetter?.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenOfferModal(candidate)}
                      className="text-[11px] font-bold text-amber-800 hover:underline shrink-0"
                    >
                      View / Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onSelectCandidate(candidate)}
                  className="px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-200 rounded font-medium transition-colors"
                >
                  View Profile
                </button>

                <div className="flex items-center gap-1.5">
                  {/* Create Upload Link Button */}
                  <button
                    type="button"
                    onClick={() => onOpenUploadLinkModal(candidate)}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded text-xs font-medium flex items-center gap-1 shadow-2xs transition-colors"
                    title="Generate or manage candidate document upload link"
                  >
                    <Share2 className="w-3 h-3 text-amber-600" />
                    <span>Upload Link</span>
                  </button>

                  {/* Generate / Preview Offer Letter Button */}
                  <button
                    type="button"
                    onClick={() => onOpenOfferModal(candidate)}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-semibold rounded text-xs flex items-center gap-1 shadow-2xs transition-colors"
                  >
                    <FileText className="w-3 h-3" />
                    <span>Offer Letter</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredCandidates.length === 0 && (
        <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
          <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">No candidates match your filter criteria.</p>
          <p className="text-xs text-slate-500 mt-1">Try resetting the department or search terms.</p>
        </div>
      )}

      {/* SCHEDULE INTERVIEW MODAL */}
      {showScheduleModal && interviewCandidate && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {editingRound ? 'Edit Interview Round' : 'Schedule Interview Round'}
                </h3>
                <p className="text-xs text-slate-500">
                  Candidate: <strong>{interviewCandidate.fullName}</strong> ({interviewCandidate.designation})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Round Title / Stage Name</label>
                <input
                  type="text"
                  value={roundName}
                  onChange={e => setRoundName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
                  placeholder="e.g. Round 2: Real Estate Aptitude & Sales Pitch"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Interviewer Name / Panel</label>
                <input
                  type="text"
                  value={interviewer}
                  onChange={e => setInterviewer(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
                  placeholder="e.g. Varun Batra (Sales Director)"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={interviewDate}
                    onChange={e => setInterviewDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Time</label>
                  <input
                    type="text"
                    value={interviewTime}
                    onChange={e => setInterviewTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
                    placeholder="11:30 AM"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Mode</label>
                  <select
                    value={interviewMode}
                    onChange={e => setInterviewMode(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="Google Meet">Google Meet (Online)</option>
                    <option value="In-Person">In-Person (HQ Sector 65)</option>
                    <option value="Phone Call">Phone Call</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Meeting / Room Link</label>
                  <input
                    type="text"
                    value={meetingLink}
                    onChange={e => setMeetingLink(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
                    placeholder="https://meet.google.com/..."
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveInterviewSchedule}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm"
              >
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EVALUATION MODAL */}
      {showEvalModal && interviewCandidate && editingRound && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Record Interview Evaluation</h3>
                <p className="text-xs text-slate-500">
                  {editingRound.roundName} · Candidate: <strong>{interviewCandidate.fullName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEvalModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1.5">Rating (1 to 5 Stars)</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setEvalRating(star)}
                      className={`p-1.5 rounded-lg border transition-all ${
                        evalRating >= star
                          ? 'bg-amber-50 border-amber-300 text-amber-500'
                          : 'bg-slate-50 border-slate-200 text-slate-300'
                      }`}
                    >
                      <Star className={`w-5 h-5 ${evalRating >= star ? 'fill-amber-400' : ''}`} />
                    </button>
                  ))}
                  <span className="font-bold text-sm text-slate-800 ml-2">{evalRating} / 5 Stars</span>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Interviewer Recommendation</label>
                <select
                  value={evalRecommendation}
                  onChange={e => setEvalRecommendation(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none cursor-pointer font-semibold text-slate-800"
                >
                  <option value="Strong Hire">⭐ Strong Hire (High Potential)</option>
                  <option value="Hire">✅ Hire (Meets Standards)</option>
                  <option value="Proceed to Next Round">➡️ Proceed to Next Round</option>
                  <option value="Hold">⏸️ Put on Hold</option>
                  <option value="Reject">❌ Reject</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Qualitative Feedback & Notes</label>
                <textarea
                  rows={3}
                  value={evalFeedback}
                  onChange={e => setEvalFeedback(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none"
                  placeholder="Detail observations regarding domain expertise, communication, and market readiness..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowEvalModal(false)}
                className="px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEval}
                className="px-4 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-sm"
              >
                Submit Evaluation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
