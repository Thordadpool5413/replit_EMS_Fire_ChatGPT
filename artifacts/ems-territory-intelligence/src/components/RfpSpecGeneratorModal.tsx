/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { Agency } from '../types';
import { hasAgencyFactEvidence } from '../data/agencyFactEvidence';
import { X, Copy, Check, Download, FileText, ShieldCheck } from 'lucide-react';

interface RfpSpecGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  agency: Agency;
}

export const RfpSpecGeneratorModal: React.FC<RfpSpecGeneratorModalProps> = ({
  isOpen,
  onClose,
  agency
}) => {
  const [includeRealBvm, setIncludeRealBvm] = useState<boolean>(true);
  const [includeAutoPulse, setIncludeAutoPulse] = useState<boolean>(true);
  const [includeTbiDashboard, setIncludeTbiDashboard] = useState<boolean>(true);
  const [includeSourcewellCoop, setIncludeSourcewellCoop] = useState<boolean>(true);
  const [includeFiveYearTcoCap, setIncludeFiveYearTcoCap] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const modalCardRef = useRef<HTMLDivElement>(null);

  // Close modal on click-away or Escape key
  useClickOutside(modalCardRef, onClose, { enabled: isOpen, closeOnEscape: true });

  if (!isOpen) return null;

  const rfpText = `
WORKING DRAFT — NOT AN ISSUED RFP OR PROCUREMENT AUTHORIZATION
Generated: ${new Date().toISOString().split('T')[0]}
AGENCY: ${agency.name.toUpperCase()} (${agency.city}, ${agency.stateCode})
${hasAgencyFactEvidence(agency, 'providerAddress') ? `Address source reviewed: ${agency.address}` : 'Address: verify against an official agency source before issue.'}
${hasAgencyFactEvidence(agency, 'departmentRegistry') && agency.stateLicenseNumber ? `Florida EMS license: ${agency.stateLicenseNumber} (${agency.stateLicenseType || 'type not listed'}; expires ${agency.stateLicenseExpiration || 'not listed'}).` : 'EMS license, FDID, and NPI: not source-verified.'}

IMPORTANT: Confirm the agency identity, service scope, current inventory, receiving-hospital protocols, installed systems, legal requirements, and all purchasing terms with the agency before use. This template does not represent an agency-approved specification, a verified budget, or legal advice.

SECTION 1. CLINICAL AND TECHNICAL REQUIREMENTS
The agency’s clinical leadership and procurement team must define acceptance criteria, regulatory requirements, interoperability, cybersecurity, field testing, and support requirements. Do not assume a particular device, vendor, hospital, ePCR/CAD system, or clinical protocol.
${includeRealBvm ? '- Optional ventilation-feedback feature: include only if requested and validated by agency medical direction.' : ''}
${includeAutoPulse ? '- Optional mechanical-CPR equipment category: specify only after agency clinical and operational review.' : ''}
${includeTbiDashboard ? '- Optional TBI decision-support category: specify only after agency medical direction and clinical governance review.' : ''}

SECTION 2. PRICING, MAINTENANCE, AND TOTAL COST OF OWNERSHIP
${includeFiveYearTcoCap
    ? '- Request itemized pricing, maintenance, batteries, consumables, warranty terms, replacement parts, and optional trade-in assumptions over the requested contract term. Require vendors to state all assumptions and exclusions.'
    : '- Procurement staff should define the requested pricing schedule and maintenance term.'}
No agency-specific incumbent cost, equipment count, trade-in credit, or savings estimate is included because those inputs have not been source-verified.

SECTION 3. COOPERATIVE PURCHASING AND PROCUREMENT REVIEW
${includeSourcewellCoop
    ? '- Ask bidders to identify any cooperative contract they propose, including the awarded contract number, current term, scope, pricing, eligible entities, and ordering procedure. The agency’s procurement and legal teams must verify eligibility and authority before use.'
    : '- Procurement method and solicitation requirements must be determined by the agency’s procurement and legal teams.'}
No authority to waive competition or bypass local procurement rules is assumed.

SECTION 4. OPTIONAL EVALUATION
Define any field trial, duration, number of evaluation units, clinical measures, training, and acceptance process only with agency approval. No trial quantity or schedule is assumed.
`.trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(rfpText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([rfpText], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `${agency.name.replace(/[^a-zA-Z0-9]/g, '_')}_RFP_Draft.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div
      className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
    >
      <div 
        ref={modalCardRef}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-4xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] flex flex-col text-slate-900 dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3.5">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-[#1E3A8A] dark:text-blue-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                RFP draft template
              </h2>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Working procurement draft for <strong className="text-slate-900 dark:text-white">{agency.name}</strong> ({agency.city}, {agency.stateCode}); no agency-specific TCO estimate
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Option Checkboxes */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-[#1E3A8A]/60 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={includeRealBvm}
              onChange={(e) => setIncludeRealBvm(e.target.checked)}
              className="accent-[#1E3A8A] dark:accent-blue-500"
            />
            <span className="text-slate-800 dark:text-slate-200 font-medium">Ventilation feedback</span>
          </label>

          <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-[#1E3A8A]/60 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={includeAutoPulse}
              onChange={(e) => setIncludeAutoPulse(e.target.checked)}
              className="accent-[#1E3A8A] dark:accent-blue-500"
            />
            <span className="text-slate-800 dark:text-slate-200 font-medium">Mechanical CPR</span>
          </label>

          <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-[#1E3A8A]/60 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={includeTbiDashboard}
              onChange={(e) => setIncludeTbiDashboard(e.target.checked)}
              className="accent-[#1E3A8A] dark:accent-blue-500"
            />
            <span className="text-slate-800 dark:text-slate-200 font-medium">TBI decision support</span>
          </label>

          <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-[#1E3A8A]/60 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={includeFiveYearTcoCap}
              onChange={(e) => setIncludeFiveYearTcoCap(e.target.checked)}
              className="accent-[#1E3A8A] dark:accent-blue-500"
            />
            <span className="text-slate-800 dark:text-slate-200 font-medium">5-year pricing schedule</span>
          </label>

          <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-[#1E3A8A]/60 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={includeSourcewellCoop}
              onChange={(e) => setIncludeSourcewellCoop(e.target.checked)}
              className="accent-[#1E3A8A] dark:accent-blue-500"
            />
            <span className="text-slate-800 dark:text-slate-200 font-medium">Cooperative purchasing review</span>
          </label>
        </div>

        {/* Formatted Text Preview */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <textarea
            readOnly
            value={rfpText}
            className="w-full flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed resize-none focus:outline-none"
            rows={15}
          />
        </div>

        {/* Modal Actions */}
        <div className="pt-3.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Draft only. Confirm all facts, technical criteria, pricing, and procurement authority before issuing.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="h-9 px-3.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-medium rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#1E3A8A] dark:text-blue-400" />}
              <span>{copied ? 'Copied to clipboard' : 'Copy draft'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="h-9 px-4 bg-slate-900 dark:bg-blue-600 hover:bg-[#1E3A8A] dark:hover:bg-blue-500 text-white font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download (.txt)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
