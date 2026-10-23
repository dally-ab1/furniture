import React, { useState, useEffect } from 'react';
import {
  Clock, X, Loader2, ShieldCheck, UserCheck,
  AlertCircle, ChevronRight, FileText
} from 'lucide-react';
import { authFetch, API_BASE } from '../services/api';


export interface RecordActivityEvent {
  id: string;
  user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  module: string | null;
  entity: string;
  entity_id: string | null;
  record_reference: string | null;
  description: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  reason: string | null;
  payload: Record<string, any> | null;
  created_at: string;
}

interface RecordActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: string;
  entityId: string;
  recordReference?: string;
  title?: string;
}

export const RecordActivityModal: React.FC<RecordActivityModalProps> = ({
  isOpen,
  onClose,
  entity,
  entityId,
  recordReference,
  title = 'Record Activity History',
}) => {
  const [logs, setLogs] = useState<RecordActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<RecordActivityEvent | null>(null);

  useEffect(() => {
    if (!isOpen || !entityId) return;

    async function loadRecordLogs() {
      setLoading(true);
      setError(null);
      setSelectedEvent(null);
      try {
        const res = await authFetch(`${API_BASE}/settings/audit-logs/record/${entity}/${entityId}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to fetch record history');
        }
        setLogs(json.data || []);
      } catch (err: any) {
        console.error('Error loading record logs:', err);
        setError(err.message || 'Could not load record activity trail');
      } finally {
        setLoading(false);
      }
    }

    loadRecordLogs();
  }, [isOpen, entity, entityId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between bg-[#FAFBF9]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#EAF3EC] text-[#276749] flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-[#202820] text-sm">
                {title} {recordReference && <span className="font-mono text-xs text-[#276749] ml-1">({recordReference})</span>}
              </h3>
              <p className="text-[11px] text-[#69736B]">
                Immutable server audit log for entity: <span className="font-mono">{entity}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-[#E3E7E1]/50 text-[#8C948D] hover:text-[#202820] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#69736B]">
              <Loader2 className="w-6 h-6 animate-spin text-[#276749] mb-2" />
              <p className="text-xs">Loading audit trail...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-[#8C948D]">
              <FileText className="w-10 h-10 mx-auto mb-2 text-[#C8CEC7]" />
              <p className="text-sm font-medium text-[#202820]">No activity recorded</p>
              <p className="text-xs text-[#8C948D] mt-0.5">
                There are no audit events associated with this record.
              </p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E3E7E1]">
              {logs.map((item) => {
                const dateObj = new Date(item.created_at);
                const isSuperAdmin = item.actor_role === 'SUPER_ADMIN';

                return (
                  <div key={item.id} className="relative group">
                    {/* Node Dot */}
                    <div className={`absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-white flex items-center justify-center ${
                      item.outcome === 'FAILURE' 
                        ? 'border-[#DC2626] bg-[#FEF2F2]' 
                        : item.outcome === 'DENIED'
                        ? 'border-[#D97706] bg-[#FFFBEB]'
                        : 'border-[#276749] bg-[#EAF3EC]'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        item.outcome === 'FAILURE' 
                          ? 'bg-[#DC2626]' 
                          : item.outcome === 'DENIED'
                          ? 'bg-[#D97706]'
                          : 'bg-[#276749]'
                      }`} />
                    </div>

                    {/* Event Card */}
                    <div className="bg-[#FAFBF9] border border-[#E3E7E1] rounded-xl p-3.5 hover:border-[#276749]/40 transition-colors">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-[#202820]">
                            {item.actor_name || 'System / Service'}
                          </span>
                          {isSuperAdmin ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EAF3EC] text-[#276749] border border-[#C8DEC9]">
                              <ShieldCheck className="w-2.5 h-2.5" />
                              Super Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EBF2FA] text-[#2563EB] border border-[#BFDBFE]">
                              <UserCheck className="w-2.5 h-2.5" />
                              Employee
                            </span>
                          )}
                          <span className="text-[10px] text-[#8C948D]">•</span>
                          <span className="font-mono text-[10px] font-semibold text-[#69736B] uppercase tracking-wider">
                            {item.action}
                          </span>
                        </div>

                        <span className="text-[11px] text-[#8C948D] shrink-0 font-medium">
                          {dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at{' '}
                          {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <p className="text-xs text-[#202820] leading-relaxed">
                        {item.description || item.action}
                      </p>

                      {item.reason && (
                        <div className="mt-2 text-[11px] bg-white border border-[#E3E7E1] rounded-lg px-2.5 py-1.5 text-[#69736B]">
                          <span className="font-semibold text-[#202820]">Reason: </span>
                          {item.reason}
                        </div>
                      )}

                      {item.payload && Object.keys(item.payload).length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-[#E3E7E1]/60 flex items-center justify-between">
                          <span className="text-[10px] font-mono text-[#8C948D]">
                            ID: {item.id.slice(0, 8)}...
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedEvent(selectedEvent?.id === item.id ? null : item)}
                            className="text-[11px] font-medium text-[#276749] hover:underline flex items-center gap-1"
                          >
                            <span>{selectedEvent?.id === item.id ? 'Hide details' : 'View payload'}</span>
                            <ChevronRight className={`w-3 h-3 transition-transform ${selectedEvent?.id === item.id ? 'rotate-90' : ''}`} />
                          </button>
                        </div>
                      )}

                      {/* Expanded Payload */}
                      {selectedEvent?.id === item.id && item.payload && (
                        <div className="mt-2.5 p-2.5 bg-[#202820] text-[#E3E7E1] rounded-lg text-[11px] font-mono overflow-x-auto max-h-48">
                          <pre>{JSON.stringify(item.payload, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#E3E7E1] bg-[#FAFBF9] flex items-center justify-between">
          <span className="text-xs text-[#8C948D]">
            {logs.length} event{logs.length === 1 ? '' : 's'} recorded
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-[#E3E7E1] hover:bg-[#FAFBF9] text-[#202820] text-xs font-semibold rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
