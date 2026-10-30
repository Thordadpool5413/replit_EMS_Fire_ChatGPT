/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useGetAfgGrants } from '@workspace/api-client-react';
import { Agency } from '../types';
import { ALL_50_STATES_SUMMARIES } from '../data/nationalGeographicData';
import { Award, ChevronRight, ExternalLink, Filter, RefreshCw, ShieldCheck } from 'lucide-react';
import { formatCurrency, formatInteger, formatScore } from '../utils/numberFormatting';

interface LiveOpenFemaRecord {
  id: string;
  awardNumber: string;
  grantee: string;
  stateCode: string;
  programName: string;
  awardAmount: number;
  fiscalYear: number;
}

interface AfgGrantsTrackerProps {
  agencies: Agency[];
  onSelectAgency: (agency: Agency) => void;
  globalState?: string;
  globalCounty?: string;
  globalCity?: string;
  globalCategory?: 'all' | 'ems' | 'fire';
  activeAccount?: Agency | null;
}

export const AfgGrantsTracker: React.FC<AfgGrantsTrackerProps> = ({
  agencies,
  onSelectAgency,
  globalState,
  globalCounty,
  globalCity,
  globalCategory,
  activeAccount: _activeAccount
}) => {
  const [selectedState, setSelectedState] = useState<string>(globalState || 'all');
  const [selectedCounty, setSelectedCounty] = useState<string>(globalCounty || 'all');
  const [selectedCity, setSelectedCity] = useState<string>(globalCity || 'all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'ems' | 'fire'>(globalCategory || 'all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [femaQueryState, setFemaQueryState] = useState<string>(
    globalState && globalState !== 'all' ? globalState : 'all'
  );
  const afgQuery = useGetAfgGrants({
    stateCode: femaQueryState === 'all' ? undefined : femaQueryState,
    limit: 100
  });
  const rawAwardRows = useMemo(() => {
    const response = afgQuery.data as unknown as { awards?: unknown[]; grants?: unknown[] } | undefined;
    return response?.awards ?? response?.grants ?? [];
  }, [afgQuery.data]);
  const liveFemaAwards = useMemo(() => rawAwardRows.map((item, index) => {
    const row = item as Record<string, unknown>;
    const getText = (...keys: string[]) => {
      for (const key of keys) {
        const value = row[key];
        if (value !== null && value !== undefined && String(value).trim()) return String(value);
      }
      return '';
    };
    const amount = Number(row.awardAmount ?? 0);
    return {
      id: getText('id', 'awardNumber', 'award') || `award-${index}`,
      awardNumber: getText('awardNumber', 'award', 'grantNumber') || 'Award number not provided',
      grantee: getText('grantee') || 'Recipient name not provided',
      stateCode: getText('stateCode'),
      programName: getText('programName') || 'Program name not provided',
      awardAmount: Number.isFinite(amount) ? amount : 0,
      fiscalYear: Number(row.fiscalYear ?? 0)
    } satisfies LiveOpenFemaRecord;
  }), [rawAwardRows, femaQueryState]);
  const PAGE_SIZE = 50;

  useEffect(() => {
    if (globalState !== undefined) {
      setSelectedState(globalState);
      setFemaQueryState(globalState);
      setCurrentPage(1);
    }
  }, [globalState]);

  useEffect(() => {
    if (globalCounty !== undefined) {
      setSelectedCounty(globalCounty);
      setCurrentPage(1);
    }
  }, [globalCounty]);

  useEffect(() => {
    if (globalCity !== undefined) {
      setSelectedCity(globalCity);
      setCurrentPage(1);
    }
  }, [globalCity]);

  useEffect(() => {
    if (globalCategory !== undefined) {
      setSelectedCategory(globalCategory);
      setCurrentPage(1);
    }
  }, [globalCategory]);

  const isLoadingFema = afgQuery.isLoading || afgQuery.isFetching;

  const grantedAgencies = useMemo(() => {
    return agencies.filter(a => {
      if (!a.grantStatus.afgAwarded) return false;
      if (selectedState !== 'all' && a.stateCode !== selectedState) return false;
      if (selectedCounty !== 'all') {
        const cleanTarget = selectedCounty.replace(/\s+(County|Parish|Borough)$/i, '').toLowerCase();
        const cleanAgency = a.county.replace(/\s+(County|Parish|Borough)$/i, '').toLowerCase();
        if (cleanAgency !== cleanTarget && a.county !== selectedCounty) return false;
      }
      if (selectedCity !== 'all' && a.city.toLowerCase() !== selectedCity.toLowerCase()) return false;
      if (selectedCategory === 'ems' && a.agencyType.toLowerCase().includes('fire')) return false;
      if (selectedCategory === 'fire' && !a.agencyType.toLowerCase().includes('fire')) return false;
      return true;
    });
  }, [agencies, selectedState, selectedCounty, selectedCity, selectedCategory]);

  const totalAwarded = useMemo(() => {
    return grantedAgencies.reduce((acc, a) => acc + a.grantStatus.afgAwardAmount, 0);
  }, [grantedAgencies]);

  const totalPages = Math.max(1, Math.ceil(grantedAgencies.length / PAGE_SIZE));
  const paginatedGrants = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return grantedAgencies.slice(start, start + PAGE_SIZE);
  }, [grantedAgencies, currentPage]);

  return (
    <div className="workspace-view-container min-w-0 w-full">
      {/* Banner & Filter Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 flex-wrap">
              <Award className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>FEMA Assistance to Firefighters Grants (AFG) &middot; OpenFEMA API v1</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                Federal source records
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-[650] text-slate-900 dark:text-white mt-1.5 tracking-tight">
              FEMA AFG award records
            </h1>
            <p className="text-[13px] text-slate-600 dark:text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Live queries to FEMA&apos;s annual OpenFEMA AFG dataset. A listed award is a historical obligation record, not proof that funds remain available or that the recipient matches a local agency profile. SAFER awards are not included.
            </p>
          </div>

          <div className="pl-4 sm:border-l border-slate-200 dark:border-slate-800 text-left sm:text-right shrink-0">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Local profiles flagged as awarded</div>
            <div className="pi-metric-hero font-[650] text-emerald-700 dark:text-emerald-400 mt-0.5 leading-none">
              {formatCurrency(totalAwarded)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 pi-data-inline">
              <span className="pi-data-number font-semibold">{formatInteger(grantedAgencies.length)}</span> unverified profile claims · not matched to FEMA records
            </div>
          </div>
        </div>

        {/* Synced Jurisdiction Context + Category Filter + Pre-Approved Cooperative Contracts */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
            <Filter className="w-3.5 h-3.5 text-[#1E3A8A] dark:text-blue-400" />
            <span className="text-slate-500 dark:text-slate-400">Active territory:</span>
            <strong className="text-slate-900 dark:text-white font-medium">
              {selectedState === 'all' ? 'All 50 States & DC' : `${ALL_50_STATES_SUMMARIES[selectedState]?.state || selectedState} (${selectedState})`}
            </strong>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">&middot;</span>
            <span className="text-slate-500 dark:text-slate-400">
              Local profiles are not proof of grant or contract status. Confirm any purchasing vehicle directly with the issuing cooperative.
            </span>
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value as 'all' | 'ems' | 'fire');
              setCurrentPage(1);
            }}
            className="h-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 text-xs text-slate-800 dark:text-white font-medium focus:outline-none focus:border-[#1E3A8A]"
          >
            <option value="all">EMS &amp; Fire recipients ({grantedAgencies.length.toLocaleString()})</option>
            <option value="ems">EMS providers only</option>
            <option value="fire">Fire departments only</option>
          </select>
        </div>
      </div>

      {/* Live OpenFEMA API v2 Federal Awards Verification Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-emerald-50/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              OpenFEMA historical AFG award records ({femaQueryState === 'all' ? 'all states' : femaQueryState})
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700">
              Newest up to 100 records
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Filter OpenFEMA records by state"
              data-testid="select-fema-state"
              value={femaQueryState}
              onChange={e => setFemaQueryState(e.target.value)}
              className="h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-white"
            >
              <option value="all">All states</option>
              {Object.keys(ALL_50_STATES_SUMMARIES).sort().map(st => (
                <option key={st} value={st}>State: {st}</option>
              ))}
            </select>
            <button
              onClick={() => void afgQuery.refetch()}
              disabled={isLoadingFema}
              className="h-7 px-2.5 rounded bg-[#1E3A8A] text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer hover:bg-blue-900 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingFema ? 'animate-spin' : ''}`} />
              <span>{isLoadingFema ? 'Querying...' : 'Refresh records'}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-800 text-xs">
                <th className="py-2.5 px-4">Federal award number</th>
                <th className="py-2.5 px-3">Recipient grantee</th>
                <th className="py-2.5 px-3">State</th>
                <th className="py-2.5 px-3">Program</th>
                <th className="py-2.5 px-3 text-right">Obligated award amount</th>
                <th className="py-2.5 px-3">Fiscal year</th>
                <th className="py-2.5 px-4 text-right">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {liveFemaAwards.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-medium text-[#1E3A8A] dark:text-blue-400 tabular-nums">
                    {rec.awardNumber}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                    {rec.grantee}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{rec.stateCode || 'Not provided'}</td>
                  <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                    {rec.programName}
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
                    ${rec.awardAmount.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 tabular-nums">
                    {rec.fiscalYear || 'Not provided'}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <a
                      href="https://www.fema.gov/api/open/v1/NonDisasterAssistanceFirefighterGrants"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#1E3A8A] dark:text-blue-400 font-medium hover:underline"
                    >
                      <span>Open dataset</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
              {liveFemaAwards.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 px-4 text-center text-slate-500">
                    {isLoadingFema ? 'Fetching OpenFEMA AFG records…' : afgQuery.isError ? 'OpenFEMA query unavailable. Local profile claims below are not verified awards.' : 'No OpenFEMA records returned for this query.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800">
          The source contains award number, recipient name, state, program, fiscal year, and obligated amount. It has no city or county field, and it does not report current unspent balances. State filters apply to this table; city/county filters apply only to the local profile list below.
        </p>
      </div>

      {/* Territory Granted Accounts Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Local profiles with an AFG award flag ({grantedAgencies.length.toLocaleString()})
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
              Unverified local profile data
            </span>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Page {currentPage} of {totalPages} &middot; Federal fiscal year (Oct 1 &ndash; Sep 30)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-800 text-xs">
                <th className="py-3 px-4">Agency &amp; jurisdiction</th>
                <th className="py-3 px-3 text-right">Profile-reported amount</th>
                <th className="py-3 px-4 hidden xl:table-cell">Program purpose</th>
                <th className="py-3 px-3 hidden md:table-cell">Target ZOLL solution</th>
                <th className="py-3 px-3 hidden sm:table-cell">Fiscal year close</th>
                <th className="py-3 px-3 text-right">Priority score</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedGrants.map((agency) => (
                <tr
                  key={agency.id}
                  className="hover:bg-slate-50/90 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
                  onClick={() => onSelectAgency(agency)}
                >
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-900 dark:text-white group-hover:text-[#1E3A8A] dark:group-hover:text-blue-400 transition-colors">
                      {agency.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {agency.city}, {agency.stateCode} &middot; {agency.county} &middot; FDID {agency.fdid || 'not listed'}
                    </div>
                  </td>

                  <td className="py-3.5 px-3 text-right">
                    <div className="font-semibold text-emerald-700 dark:text-emerald-400 pi-metric-card">
                      {formatCurrency(agency.grantStatus.afgAwardAmount, { compact: false })}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 pi-data-inline">
                      FY{agency.grantStatus.afgFiscalYear} · unverified
                    </div>
                  </td>

                  <td className="py-3.5 px-4 max-w-xs hidden xl:table-cell">
                    <div className="text-slate-700 dark:text-slate-300 leading-snug">
                      {agency.grantStatus.afgPurpose}
                    </div>
                  </td>

                  <td className="py-3.5 px-3 hidden md:table-cell">
                    <span className="font-medium text-[#1E3A8A] dark:text-blue-400">
                      {agency.zollOpportunity.primaryTargetProduct}
                    </span>
                  </td>

                  <td className="py-3.5 px-3 hidden sm:table-cell">
                    <div className="text-amber-700 dark:text-amber-400 font-medium tabular-nums">
                      {agency.grantStatus.fiscalYearEndMonth} 2026
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Municipal fiscal close
                    </div>
                  </td>

                  <td className="py-3.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex flex-col items-end w-14">
                      <span className="font-semibold text-xs text-slate-900 dark:text-white pi-data-inline">
                        <strong className="pi-data-number text-xs font-semibold">{formatScore(agency.zollOpportunity.pulseIqScore)}</strong>
                      </span>
                      <div className="w-full h-[3px] bg-slate-200 dark:bg-slate-700 overflow-hidden mt-1 rounded-full">
                        <div
                          className="h-full bg-[#1E3A8A] dark:bg-blue-400 rounded-full"
                          style={{ width: `${agency.zollOpportunity.pulseIqScore}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onSelectAgency(agency)}
                      className="h-7 px-3 rounded-lg bg-slate-900 dark:bg-blue-600 hover:bg-[#1E3A8A] dark:hover:bg-blue-500 text-white font-medium text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <span>Inspect</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
            <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              Showing {((currentPage - 1) * PAGE_SIZE) + 1}&ndash;{Math.min(currentPage * PAGE_SIZE, grantedAgencies.length)} of {grantedAgencies.length.toLocaleString()} recipients
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-white disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-white disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
