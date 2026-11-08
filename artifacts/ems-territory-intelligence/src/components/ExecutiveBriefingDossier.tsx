/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Agency, AgencyFactEvidenceKey, PredictiveWeights } from '../types';
import { getAgencyMedicareDenialMetricForDisplay } from '../services/agencyMedicareDenialService';
import { AGENCY_FACT_EVIDENCE_FIELDS, getAgencyFactEvidenceStatus } from '../data/agencyFactEvidence';
import { getAgencyProfileReviewedAt } from '../services/agencyProfileReviewStore';
import {
  Printer,
  Download,
  FileDown,
  X,
  Building2,
  Phone,
  Mail,
  MapPin,
  Globe,
  CheckCircle2,
  FileText,
  DollarSign,
  HeartPulse,
  Activity,
  Award,
  Truck,
  ShieldCheck,
  Calendar,
  Layers,
  ChevronRight,
  Sparkles,
  Scale,
  AlertTriangle,
  Loader2,
  Clock,
  UserCheck,
  Briefcase
} from 'lucide-react';
import brandLogoAsset from '../assets/images/nicks_ems_logo_1792367124466.jpg';
import { calculateAgencyFleetTco, calculateAgencyHcpcsBreakdown } from '../data/clinicalAndCompetitiveIntelligence';
import { explainAgencyScore } from '../utils/pulseIqExplanation';
import { PulseIqEstimateLabel } from './PulseIqEstimateLabel';

interface ExecutiveBriefingDossierProps {
  agency: Agency;
  weights?: PredictiveWeights;
  isOpen: boolean;
  onClose: () => void;
}

const reportNumber = (value: number | null | undefined, suffix = '') =>
  value == null || !Number.isFinite(value) ? 'Not reported' : `${value.toLocaleString()}${suffix}`;

const factLabel = (key: AgencyFactEvidenceKey) =>
  AGENCY_FACT_EVIDENCE_FIELDS.find((field) => field.key === key)?.label ??
  key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

const printableSourceUrl = (value?: string) => {
  try {
    const url = new URL(value || '');
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const reportSections = [
  { key: 'overview', label: 'Agency overview & operations' },
  { key: 'clinical', label: 'Clinical, claims & contracts' },
  { key: 'commercial', label: 'Fleet costs & purchasing' },
  { key: 'sources', label: 'Source references' },
] as const;

type ReportSectionKey = (typeof reportSections)[number]['key'];

const allReportSectionsIncluded = (): Record<ReportSectionKey, boolean> => ({
  overview: true,
  clinical: true,
  commercial: true,
  sources: true,
});

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);

const standaloneStyleProperties = [
  'align-content', 'align-items', 'align-self', 'background-color', 'background-image',
  'background-position', 'background-repeat', 'background-size', 'border', 'border-bottom',
  'border-bottom-color', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'border-bottom-style', 'border-bottom-width', 'border-collapse', 'border-color',
  'border-left', 'border-left-color', 'border-left-style', 'border-left-width',
  'border-radius', 'border-right', 'border-right-color', 'border-right-style',
  'border-right-width', 'border-spacing', 'border-style', 'border-top', 'border-top-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-top-style', 'border-top-width',
  'border-width', 'box-shadow', 'box-sizing', 'color', 'column-gap', 'display', 'fill',
  'flex', 'flex-basis', 'flex-direction', 'flex-grow', 'flex-shrink', 'flex-wrap',
  'font-family', 'font-size', 'font-style', 'font-weight', 'gap', 'grid-auto-columns',
  'grid-auto-flow', 'grid-auto-rows', 'grid-column', 'grid-column-gap', 'grid-row',
  'grid-row-gap', 'grid-template-columns', 'grid-template-rows', 'height', 'justify-content',
  'justify-items', 'justify-self', 'letter-spacing', 'line-height', 'list-style',
  'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'max-height',
  'max-width', 'min-height', 'min-width', 'object-fit', 'object-position', 'opacity',
  'overflow', 'overflow-wrap', 'overflow-x', 'overflow-y', 'padding', 'padding-bottom',
  'padding-left', 'padding-right', 'padding-top', 'page-break-after', 'page-break-before',
  'page-break-inside', 'position', 'stroke', 'text-align', 'text-decoration',
  'text-overflow', 'text-transform', 'transform', 'vertical-align', 'white-space',
  'width', 'word-break',
];

const imageToDataUrl = async (image: HTMLImageElement): Promise<string | undefined> => {
  const source = image.currentSrc || image.src;
  if (!source || source.startsWith('data:')) return source || undefined;
  try {
    const response = await fetch(source);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
};

export const ExecutiveBriefingDossier: React.FC<ExecutiveBriefingDossierProps> = ({
  agency,
  weights,
  isOpen,
  onClose
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfPaperSize, setPdfPaperSize] = useState<'a4' | 'letter'>('a4');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileReviewedAt, setProfileReviewedAt] = useState<string | null>(null);
  const [includedSections, setIncludedSections] = useState<Record<ReportSectionKey, boolean>>(
    allReportSectionsIncluded,
  );
  const documentRef = useRef<HTMLDivElement>(null);
  const denialMetric = agency ? getAgencyMedicareDenialMetricForDisplay(agency) : null;

  // Support closing with Escape key
  useEffect(() => {
    if (!isOpen) return;
    setProfileReviewedAt(getAgencyProfileReviewedAt(agency.id));
    setIncludedSections(allReportSectionsIncluded());
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [agency.id, isOpen, onClose]);

  // Derived 5-Year TCO Comparison Model
  const tcoModel = useMemo(() => {
    if (!agency) return null;
    const reportedDefibCount = agency.installedFleet?.defibUnitsCount;
    if (reportedDefibCount == null || !Number.isFinite(reportedDefibCount) || reportedDefibCount <= 0) return null;
    return calculateAgencyFleetTco(agency, 5, reportedDefibCount);
  }, [agency]);

  // Derived Granular HCPCS Medicare & Commercial Denial Model
  const hcpcsModel = useMemo(() => {
    if (!agency) return null;
    return calculateAgencyHcpcsBreakdown(agency);
  }, [agency]);
  const hasTcoInputs = Boolean(tcoModel && tcoModel.unitCount > 0);
  const formatTcoValue = (value: number | undefined) =>
    !hasTcoInputs || value == null || !Number.isFinite(value)
      ? 'Not calculated'
      : `$${value.toLocaleString()}`;

  // Derived operational-factor score attribution
  const scoreExplanation = useMemo(() => {
    if (!agency) return null;
    return explainAgencyScore(agency, weights);
  }, [agency, weights]);

  // ALWAYS KEEP ALL HOOKS ABOVE EARLY RETURN
  if (!isOpen || !agency) return null;
  const isFire = agency.providerCategory === 'FIRE' || agency.agencyType.toLowerCase().includes('fire');
  const primaryContact = agency.keyContacts && agency.keyContacts.length > 0 ? agency.keyContacts[0] : undefined;
  const departmentPhone = agency.headquartersPhone || primaryContact?.phone || 'Not reported';
  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const includedSectionCount = Object.values(includedSections).filter(Boolean).length;
  const toggleReportSection = (section: ReportSectionKey, included: boolean) => {
    setIncludedSections((current) => {
      const currentIncludedCount = Object.values(current).filter(Boolean).length;
      if (!included && current[section] && currentIncludedCount === 1) return current;
      return { ...current, [section]: included };
    });
  };

  const fleet = agency.apparatusFleet;
  const logistics = agency.hospitalLogistics;
  const femaGrants = agency.femaGrantHistory ?? [];
  const sourceReferences = [
    ...Object.entries(agency.factEvidence ?? {}).flatMap(([key, evidence]) => {
      if (!evidence || (!evidence.sourceName?.trim() && !evidence.sourceUrl)) return [];
      const fieldKey = key as AgencyFactEvidenceKey;
      const status = getAgencyFactEvidenceStatus(agency, fieldKey);
      return [{
        label: factLabel(fieldKey),
        sourceName: evidence.sourceName?.trim() || 'Source name not provided',
        url: evidence.sourceUrl,
        period: evidence.reportingPeriod,
        periodLabel: 'Reporting period',
        status: status === 'source-reviewed'
          ? `Review marker recorded${evidence.reviewedAt ? ` · ${new Date(evidence.reviewedAt).toLocaleDateString()}` : ''}`
          : status === 'source-mapped'
            ? 'Source mapped; not marked reviewed'
            : 'Source record incomplete',
        detail: evidence.note,
      }];
    }),
    ...(agency.sourceFacts ?? []).map((fact) => ({
      label: factLabel(fact.fieldKey),
      sourceName: fact.sourceName,
      url: fact.sourceUrl,
      period: fact.reportingPeriod || fact.effectivePeriod,
      periodLabel: 'Reporting period',
      status: fact.basis === 'user-entered'
        ? 'User-entered source record'
        : fact.basis === 'calculated'
          ? 'Calculated source record'
          : 'Source-reported record',
      detail: fact.note,
    })),
    ...(agency.sourceRecordAssociations ?? []).map((association) => ({
      label: 'Agency source match',
      sourceName: association.sourceName,
      url: association.sourceUrl,
      period: association.sourceDate || undefined,
      periodLabel: 'Source date',
      status: association.decision === 'confirmed'
        ? 'User-confirmed source match'
        : 'User-rejected source match',
      detail: association.matchBasis,
    })),
  ].filter((reference, index, references) => references.findIndex((candidate) =>
    candidate.label === reference.label &&
    candidate.sourceName === reference.sourceName &&
    candidate.url === reference.url &&
    candidate.period === reference.period,
  ) === index);

  // ACTION 1: Trigger Native Browser Print Dialog (Scoped CSS ensures only document prints)
  const handlePrint = () => {
    window.print();
  };

  // ACTION 2: Direct Client-Side PDF Generation & Download
  const handleDownloadPdf = async () => {
    if (!documentRef.current) return;
    setIsGeneratingPdf(true);
    setDownloadSuccess(null);
    setErrorMessage(null);

    try {
      const element = documentRef.current;
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);

      // Capture at 2x scale with guaranteed solid white background
      const searchableText: Array<{
        text: string;
        left: number;
        top: number;
        height: number;
        fontSize: number;
        bold: boolean;
        italic: boolean;
      }> = [];
      const sourceLinkAnnotations: Array<{
        url: string;
        left: number;
        top: number;
        width: number;
        height: number;
      }> = [];
      let searchableLayoutWidth = element.getBoundingClientRect().width;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1200,
        onclone: (clonedDoc) => {
          const docEl = clonedDoc.querySelector('.print-dossier-document') as HTMLElement | null;
          if (docEl) {
            docEl.style.backgroundColor = '#ffffff';
            docEl.style.color = '#0f172a';
            const statusColors: Record<string, [string, string, string]> = {
              fire: ['#991b1b', '#fee2e2', '#fca5a5'],
              ems: ['#1e3a8a', '#dbeafe', '#93c5fd'],
              reviewed: ['#166534', '#dcfce7', '#86efac'],
              mapped: ['#1e40af', '#dbeafe', '#93c5fd'],
              reported: ['#1e40af', '#dbeafe', '#93c5fd'],
              warning: ['#92400e', '#fef3c7', '#fcd34d'],
              calculated: ['#5b21b6', '#ede9fe', '#c4b5fd'],
              'user-entered': ['#6b21a8', '#f3e8ff', '#d8b4fe'],
              disbursed: ['#166534', '#dcfce7', '#86efac'],
              active: ['#1e40af', '#dbeafe', '#93c5fd'],
              planned: ['#92400e', '#fef3c7', '#fcd34d'],
            };
            const printableElements = [docEl, ...Array.from(docEl.querySelectorAll<HTMLElement>('*'))];
            printableElements.forEach((printableElement) => {
              const style = clonedDoc.defaultView?.getComputedStyle(printableElement);
              if (!style) return;
              const statusColorsForElement = statusColors[printableElement.dataset.statusKind ?? ''];
              const fallbackTextColor = printableElement.matches('h1, h2, h3, strong, th')
                ? '#111827'
                : printableElement.tagName === 'A'
                  ? '#1d4ed8'
                  : '#334155';
              const normalizeColor = (
                property: string,
                computedValue: string,
                fallback: string,
              ) => {
                if (computedValue.includes('oklch')) {
                  printableElement.style.setProperty(property, fallback, 'important');
                }
              };
              normalizeColor('color', style.color, fallbackTextColor);
              normalizeColor(
                'background-color',
                style.backgroundColor,
                statusColorsForElement?.[1] ?? 'transparent',
              );
              normalizeColor(
                'border-color',
                style.borderColor,
                statusColorsForElement?.[2] ?? '#cbd5e1',
              );
              normalizeColor('outline-color', style.outlineColor, '#cbd5e1');
              normalizeColor('text-decoration-color', style.textDecorationColor, fallbackTextColor);
              normalizeColor('fill', style.fill, '#334155');
              normalizeColor('stroke', style.stroke, 'none');
              if (style.boxShadow.includes('oklch')) {
                printableElement.style.setProperty('box-shadow', 'none', 'important');
              }
              if (style.backgroundImage.includes('oklch')) {
                printableElement.style.setProperty('background-image', 'none', 'important');
              }
              if (statusColorsForElement) {
                printableElement.style.setProperty('color', statusColorsForElement[0], 'important');
                printableElement.style.setProperty('background-color', statusColorsForElement[1], 'important');
                printableElement.style.setProperty('border-color', statusColorsForElement[2], 'important');
              }
            });

            const rootRect = docEl.getBoundingClientRect();
            searchableLayoutWidth = rootRect.width;
            docEl.querySelectorAll<HTMLAnchorElement>('.print-source-url[href]').forEach((anchor) => {
              const url = printableSourceUrl(anchor.getAttribute('href') ?? undefined);
              if (!url) return;
              Array.from(anchor.getClientRects()).forEach((rect) => {
                if (rect.width <= 0 || rect.height <= 0) return;
                sourceLinkAnnotations.push({
                  url,
                  left: rect.left - rootRect.left,
                  top: rect.top - rootRect.top,
                  width: rect.width,
                  height: rect.height,
                });
              });
            });
            const walker = clonedDoc.createTreeWalker(
              docEl,
              clonedDoc.defaultView?.NodeFilter.SHOW_TEXT ?? NodeFilter.SHOW_TEXT,
            );
            const range = clonedDoc.createRange();

            while (walker.nextNode()) {
              const textNode = walker.currentNode as Text;
              const parent = textNode.parentElement;
              const text = textNode.textContent ?? '';
              if (!parent || !text.trim()) continue;

              const style = clonedDoc.defaultView?.getComputedStyle(parent);
              if (!style || style.display === 'none' || style.visibility === 'hidden') continue;

              const words = /\S+/g;
              let match: RegExpExecArray | null;
              while ((match = words.exec(text))) {
                range.setStart(textNode, match.index);
                range.setEnd(textNode, match.index + match[0].length);
                const rect = range.getBoundingClientRect();
                if (!rect.width || !rect.height) continue;

                searchableText.push({
                  text: match[0],
                  left: rect.left - rootRect.left,
                  top: rect.top - rootRect.top,
                  height: rect.height,
                  fontSize: Number.parseFloat(style.fontSize) || rect.height,
                  bold: Number.parseInt(style.fontWeight, 10) >= 600 || style.fontWeight === 'bold',
                  italic: style.fontStyle === 'italic',
                });
              }
            }
            range.detach();
          }
        }
      });

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: pdfPaperSize
      });

      const pageWidth = pdfPaperSize === 'a4' ? 210 : 215.9;
      const pageHeight = pdfPaperSize === 'a4' ? 297 : 279.4;
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);
      const contentHeight = pageHeight - (margin * 2);
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const cssPixelToMm = imgWidth / searchableLayoutWidth;
      const lastTextPageIndex = searchableText.length > 0
        ? searchableText.reduce((lastPage, item) => Math.max(
          lastPage,
          Math.floor(((item.top + item.height * 0.82) * cssPixelToMm) / contentHeight),
        ), 0)
        : Math.ceil(imgHeight / contentHeight) - 1;
      const pageCount = Math.max(1, lastTextPageIndex + 1);
      const sourcePixelsPerPage = (contentHeight * canvas.width) / imgWidth;

      // Crop each page to its printable area so adjacent pages do not overlap.
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        if (pageIndex > 0) pdf.addPage(pdfPaperSize, 'p');
        const sourceTop = pageIndex * sourcePixelsPerPage;
        const sourceHeight = Math.min(sourcePixelsPerPage, canvas.height - sourceTop);
        if (sourceHeight <= 0) continue;
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = Math.ceil(sourceHeight);
        const pageContext = pageCanvas.getContext('2d');
        if (!pageContext) throw new Error('Could not prepare a PDF page image.');
        pageContext.drawImage(
          canvas,
          0,
          sourceTop,
          canvas.width,
          sourceHeight,
          0,
          0,
          canvas.width,
          sourceHeight,
        );
        const pageImageHeight = (sourceHeight * imgWidth) / canvas.width;
        pdf.addImage(
          pageCanvas.toDataURL('image/jpeg', 0.95),
          'JPEG',
          margin,
          margin,
          imgWidth,
          pageImageHeight,
        );
      }

      // Add invisible positioned text so the PDF can be searched and copied.
      for (const item of searchableText) {
        const baselineMm = (item.top + item.height * 0.82) * cssPixelToMm;
        const pageIndex = Math.floor(baselineMm / contentHeight);
        if (pageIndex >= pageCount) continue;

        pdf.setPage(pageIndex + 1);
        pdf.setFont('helvetica', item.bold ? 'bold' : item.italic ? 'italic' : 'normal');
        pdf.setFontSize(Math.max(1, item.fontSize * 0.75));
        pdf.text(
          item.text,
          margin + item.left * cssPixelToMm,
          margin + baselineMm - pageIndex * contentHeight,
          {
            renderingMode: 'invisible',
          },
        );
      }

      // The page images preserve the visible URL text, while these annotations
      // make each printed source reference clickable in the downloaded PDF.
      for (const sourceLink of sourceLinkAnnotations) {
        const topMm = sourceLink.top * cssPixelToMm;
        const bottomMm = (sourceLink.top + sourceLink.height) * cssPixelToMm;
        const pageIndex = Math.floor(((topMm + bottomMm) / 2) / contentHeight);
        if (pageIndex >= pageCount) continue;

        const pageOffsetMm = pageIndex * contentHeight;
        const leftMm = Math.max(margin, margin + sourceLink.left * cssPixelToMm);
        const rightMm = Math.min(
          margin + contentWidth,
          margin + (sourceLink.left + sourceLink.width) * cssPixelToMm,
        );
        const topOnPageMm = Math.max(margin, margin + topMm - pageOffsetMm);
        const bottomOnPageMm = Math.min(
          margin + contentHeight,
          margin + bottomMm - pageOffsetMm,
        );
        if (rightMm <= leftMm || bottomOnPageMm <= topOnPageMm) continue;

        pdf.setPage(pageIndex + 1);
        pdf.link(
          leftMm,
          topOnPageMm,
          rightMm - leftMm,
          bottomOnPageMm - topOnPageMm,
          { url: sourceLink.url },
        );
      }

      const cleanFileName = agency.name.replace(/[^a-zA-Z0-9]/g, '_');
      pdf.save(`${cleanFileName}_ZOLL_Executive_Dossier.pdf`);
      setDownloadSuccess('PDF file saved successfully!');
      setTimeout(() => setDownloadSuccess(null), 4000);
    } catch (err: any) {
      console.error('PDF export error:', err);
      setErrorMessage(err?.message || 'Error generating PDF. Opening print dialog...');
      setTimeout(() => setErrorMessage(null), 5000);
      // Fallback: trigger browser print
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // ACTION 3: Standalone HTML Briefing Report Download (Instant Offline Archival)
  const handleDownloadHtml = async () => {
    if (!documentRef.current) return;
    const cleanFileName = agency.name.replace(/[^a-zA-Z0-9]/g, '_');
    const sourceRoot = documentRef.current;
    const exportedRoot = sourceRoot.cloneNode(true) as HTMLElement;
    exportedRoot.id = 'briefing-dossier-document';

    const sourceElements = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>('*'))];
    const exportedElements = [exportedRoot, ...Array.from(exportedRoot.querySelectorAll<HTMLElement>('*'))];
    sourceElements.forEach((sourceElement, index) => {
      const exportedElement = exportedElements[index];
      if (!exportedElement) return;
      const computedStyle = window.getComputedStyle(sourceElement);
      standaloneStyleProperties.forEach((property) => {
        const value = computedStyle.getPropertyValue(property);
        if (value) exportedElement.style.setProperty(property, value);
      });
    });

    const sourceImages = Array.from(sourceRoot.querySelectorAll('img'));
    const exportedImages = Array.from(exportedRoot.querySelectorAll('img'));
    await Promise.all(sourceImages.map(async (image, index) => {
      const dataUrl = await imageToDataUrl(image);
      const exportedImage = exportedImages[index];
      if (dataUrl && exportedImage) {
        exportedImage.src = dataUrl;
        exportedImage.removeAttribute('srcset');
      } else if (exportedImage) {
        const fallback = document.createElement('span');
        fallback.textContent = image.alt;
        exportedImage.replaceWith(fallback);
      }
    }));

    const content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(agency.name)} — ZOLL Executive Account Briefing Dossier</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #fff; color: #0f172a; }
    body { padding: 24px; font-family: Arial, Helvetica, sans-serif; }
    #briefing-dossier-document { width: 100% !important; max-width: 1100px !important; margin: 0 auto !important; padding: 24px !important; background: #fff !important; color: #0f172a !important; }
    table { width: 100% !important; border-collapse: collapse !important; margin: 8px 0 !important; }
    th, td { border: 1px solid #cbd5e1 !important; padding: 7px 8px !important; text-align: left; font-size: 10pt; vertical-align: top; }
    th { background: #f1f5f9 !important; font-weight: 700; }
    img { max-width: 100%; }
    a { color: #1e3a8a !important; text-decoration: underline; overflow-wrap: anywhere; }
    .dossier-page-break { page-break-before: always; break-before: page; margin-top: 32px !important; border-top: 2px dashed #94a3b8 !important; padding-top: 24px !important; }
    .print-summary, .print-profile-review, .print-source-references li, tr { page-break-inside: avoid; break-inside: avoid; }
    .print-status-badge { display: inline-flex; align-items: center; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; font-weight: 700; }
    .print-status-badge[data-status-kind="fire"] { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
    .print-status-badge[data-status-kind="ems"] { background: #dbeafe; color: #1e3a8a; border-color: #93c5fd; }
    .print-status-badge[data-status-kind="reviewed"] { background: #dcfce7; color: #166534; border-color: #86efac; }
    .print-status-badge[data-status-kind="mapped"], .print-status-badge[data-status-kind="reported"] { background: #dbeafe; color: #1e40af; border-color: #93c5fd; }
    .print-status-badge[data-status-kind="warning"] { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
    .print-status-badge[data-status-kind="calculated"] { background: #ede9fe; color: #5b21b6; border-color: #c4b5fd; }
    .print-status-badge[data-status-kind="user-entered"] { background: #f3e8ff; color: #6b21a8; border-color: #d8b4fe; }
    .print-status-badge[data-status-kind="disbursed"] { background: #dcfce7; color: #166534; border-color: #86efac; }
    .print-status-badge[data-status-kind="active"] { background: #dbeafe; color: #1e40af; border-color: #93c5fd; }
    .print-status-badge[data-status-kind="planned"] { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
    @media (max-width: 640px) {
      body { padding: 8px; }
      #briefing-dossier-document { padding: 12px !important; }
      table { font-size: 9pt; }
      th, td { padding: 5px !important; }
    }
    @page { size: auto; margin: 12mm; }
    @media print {
      html, body { width: auto; min-height: 0; padding: 0 !important; background: #fff !important; }
      #briefing-dossier-document { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
      .print-dossier-document {
        color-scheme: light !important;
        color: #111827 !important;
        background: #ffffff !important;
      }
      .print-dossier-document * {
        color: #334155;
        background-color: transparent;
        border-color: #cbd5e1;
      }
      .print-dossier-document h1,
      .print-dossier-document h2,
      .print-dossier-document h3,
      .print-dossier-document strong,
      .print-dossier-document th {
        color: #111827 !important;
      }
      .print-dossier-document a {
        color: #1d4ed8 !important;
        text-decoration: underline !important;
        overflow-wrap: anywhere !important;
      }
      .print-dossier-document .dossier-page-break {
        display: block !important;
        break-before: page !important;
        page-break-before: always !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        border: 0 !important;
      }
      table { table-layout: fixed; }
      thead { display: table-header-group; }
      th, td { overflow-wrap: anywhere; font-size: 8pt; }
      a { color: #1e3a8a !important; }
      .print-agency-identifiers { border-top: 1px solid #e2e8f0 !important; padding-top: 0.2rem !important; color: #64748b !important; font-size: 7pt !important; }
      .print-summary { border-left: 4px solid #1e3a8a !important; background: #f8fafc !important; }
      .print-summary-value { color: #0f172a !important; font-size: 11pt !important; font-weight: 700 !important; }
      .print-profile-review { color: #64748b !important; font-size: 7pt !important; }
      .print-planning-estimate { background: #f8fafc !important; border-color: #cbd5e1 !important; color: #475569 !important; box-shadow: none !important; }
      #briefing-dossier-document .grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      .print-status-badge, .print-summary, .print-summary-value {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  ${exportedRoot.outerHTML}
</body>
</html>`;

    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${cleanFileName}_Executive_Briefing.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadSuccess('HTML Briefing saved successfully!');
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  return (
    <div 
      id="briefing-dossier-modal-container"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex justify-center p-2 sm:p-4 md:p-6"
    >
      {/* Dossier Preview Container */}
      <div className="relative w-full max-w-4xl bg-white shadow-2xl rounded-2xl flex flex-col my-auto border border-slate-300 overflow-hidden">
        
        {/* Sticky Control Bar (Hidden on print) */}
        <div className="sticky top-0 z-20 bg-slate-900 text-white px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md no-print">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-blue-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Executive Account Briefing Dossier</h2>
              <p className="text-[11px] text-slate-300">
                Printable agency brief · Review field-level sources before relying on reported values
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {downloadSuccess && (
              <span className="text-xs text-emerald-400 font-semibold bg-emerald-950/80 border border-emerald-700 px-2.5 py-1 rounded-md">
                Saved · {downloadSuccess}
              </span>
            )}
            {errorMessage && (
              <span className="text-xs text-rose-300 font-semibold bg-rose-950/80 border border-rose-700 px-2.5 py-1 rounded-md">
                Issue · {errorMessage}
              </span>
            )}

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200">
              <span>Paper</span>
              <select
                aria-label="Direct PDF paper size"
                value={pdfPaperSize}
                onChange={(event) => setPdfPaperSize(event.target.value as 'a4' | 'letter')}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              >
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
              </select>
            </label>

            {/* Direct PDF Download Button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              title="Download high-resolution PDF file directly"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Building PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </>
              )}
            </button>

            {/* Print Document / Save to PDF */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-[#1E3A8A] text-white hover:bg-blue-800 transition-colors cursor-pointer shadow-xs"
              title="Print document or use browser 'Save as PDF'"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            {/* Save Offline HTML */}
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer border border-slate-700"
              title="Save standalone HTML report for offline reading or emailing"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save HTML</span>
            </button>

            {/* Close Modal */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="no-print border-b border-slate-200 bg-slate-50 px-4 sm:px-6 py-3">
          <fieldset>
            <legend className="text-xs font-semibold text-slate-700 mb-2">
              Choose sections to include
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {reportSections.map(({ key, label }) => (
                <label key={key} className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid={`checkbox-brief-section-${key}`}
                    checked={includedSections[key]}
                    disabled={includedSections[key] && includedSectionCount === 1}
                    onChange={(event) => toggleReportSection(key, event.currentTarget.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 disabled:cursor-not-allowed"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              These choices apply only to this brief export and do not change the agency profile.
            </p>
          </fieldset>
        </div>

        {/* Printable Document Root (Captured by html2canvas and styled for @media print) */}
        <div ref={documentRef} className="p-6 sm:p-10 text-slate-900 bg-white print-dossier-document font-sans">
          
          {/* ================= PAGE 1: EXECUTIVE OVERVIEW, LEADERSHIP, FLEET & OPERATIONAL LOGISTICS ================= */}
          <section
            data-report-section="overview"
            hidden={!includedSections.overview}
            className="space-y-5"
          >
            
            {/* Top Dossier Header Banner */}
                <div className="print-agency-identity flex items-start justify-between border-b-2 border-slate-900 pb-5 gap-4">
              <div className="flex items-start gap-5">
                <img
                  src={brandLogoAsset || `${import.meta.env.BASE_URL}logo.jpg`}
                  alt="Nick's EMS & Fire Territory Intelligence"
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-contain border-2 border-slate-300 p-1.5 shrink-0 bg-white shadow-sm"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = `${import.meta.env.BASE_URL}logo.jpg`;
                  }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      data-status-kind={isFire ? 'fire' : 'ems'}
                      className={`print-status-badge px-2.5 py-0.5 rounded text-xs font-semibold text-white ${
                      isFire ? 'bg-red-700' : 'bg-[#1E3A8A]'
                    }`}>
                      {isFire ? 'Fire department' : 'EMS provider'}
                    </span>
                  <span className="text-xs text-slate-600 font-medium">
                      {agency.agencyType} &middot; {agency.jurisdictionLevel} jurisdiction
                    </span>
                  </div>
                  <h1 className="text-[28px] sm:text-[32px] font-[650] text-slate-900 tracking-tight mt-1 leading-tight">
                    {agency.name}
                  </h1>
                  <p className="print-agency-location text-xs text-slate-700 mt-1">
                    <span>{agency.address || [agency.city, agency.county, agency.stateCode, agency.zipCode].filter(Boolean).join(', ')}</span>
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-xs text-slate-500 font-medium">Dossier publication date</div>
                <div className="text-xs font-semibold text-slate-900 mt-0.5">{currentDate}</div>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 border border-slate-300 text-slate-700 text-xs font-medium">
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  <span>Agency profile · prepared {currentDate}</span>
                </div>
              </div>
            </div>

            <div className="print-summary rounded-lg border border-slate-200 border-l-4 border-l-blue-900 bg-slate-50 p-3">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">Operations summary</h2>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">{isFire ? 'Annual fire-rescue calls' : 'Annual EMS transports'}</div>
                  <div className="print-summary-value text-base font-bold text-slate-900 tabular-nums">
                    {reportNumber(isFire ? agency.annualCallVolume : agency.annual911Transports)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{isFire ? 'Stations' : 'Annual calls / dispatches'}</div>
                  <div className="print-summary-value text-base font-bold text-slate-900 tabular-nums">
                    {reportNumber(isFire ? agency.stationsCount : agency.annualCallVolume)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Population served</div>
                  <div className="print-summary-value text-base font-bold text-slate-900 tabular-nums">{reportNumber(agency.populationServed)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Frontline units</div>
                  <div className="print-summary-value text-base font-bold text-slate-900 tabular-nums">
                    {reportNumber(agency.frontlineRescueUnitCount ?? fleet?.totalActiveUnits)}
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-600">
                Values are shown as recorded in this profile; see the source references below for field-level source and review status.
              </p>
            </div>

            <div className="print-agency-identifiers flex flex-wrap gap-x-2 text-[10px] text-slate-500">
              <span>Registry IDs</span>
              <span>FDID: {agency.fdid || 'Not recorded'}</span>
              <span>NPI: {agency.npiNumber || 'Unassigned'}</span>
              <span>Taxonomy: {agency.taxonomyCode || 'Not reported'}</span>
            </div>

            <div className="print-profile-review border-l-2 border-slate-300 pl-2 text-[9px] text-slate-500">
              User review status in this browser: {profileReviewedAt
                ? `profile marked reviewed ${new Date(profileReviewedAt).toLocaleDateString()} (user-recorded; not independent verification)`
                : 'not marked reviewed (this is not a verification status)'}
            </div>

            {/* Official Leadership & Key Contacts Directory */}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
                <span>Agency leadership and contact details</span>
                <span className="text-xs text-slate-500">See source references for field-level status</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <div className="text-[11px] font-medium text-slate-500">Authorized official</div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">
                    {agency.nppesOfficialName || primaryContact?.name || 'Not reported'}
                  </div>
                  <div className="text-xs text-slate-600">
                    {agency.nppesOfficialTitle || primaryContact?.title || primaryContact?.role || 'Not reported'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    Direct: {departmentPhone}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-slate-500">Command headquarters contact</div>
                  <div className="text-xs font-semibold text-[#1E3A8A] mt-0.5 tabular-nums">
                    {departmentPhone}
                  </div>
                  <div className="text-xs text-slate-600 truncate" title={agency.address}>
                    {agency.address}
                  </div>
                  {agency.officialWebsite && (
                    <div className="text-xs text-blue-700 truncate mt-0.5 font-medium">
                      {agency.officialWebsite}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[11px] font-medium text-slate-500">Clinical software stack</div>
                  <div className="text-xs font-semibold text-slate-900 mt-0.5">
                    Billing: {agency.installedFleet?.billingSoftware || 'Not reported'}
                  </div>
                  <div className="text-xs text-slate-700 mt-0.5">
                    ePCR: <span className="font-medium">{agency.installedFleet?.epcrCadSoftware || 'Not reported'}</span>
                  </div>
                  <div className="text-xs text-blue-700 font-medium">
                    CAD: {agency.installedFleet?.dispatchCadVendor || 'Not reported'}
                  </div>
                </div>
              </div>

              {/* Full Key Contacts Table */}
              {agency.keyContacts && agency.keyContacts.length > 0 && (
                <div className="mt-2.5 overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-medium">
                      <tr>
                        <th className="py-2 px-3">Contact official</th>
                        <th className="py-2 px-3">Functional role</th>
                        <th className="py-2 px-3">Direct phone</th>
                        <th className="py-2 px-3">Official email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800">
                      {agency.keyContacts.map((contact, cIdx) => (
                        <tr key={contact.id || cIdx} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-medium text-slate-900">{contact.name}</td>
                          <td className="py-1.5 px-3 text-slate-600">{contact.title || contact.role}</td>
                          <td className="py-1.5 px-3 text-slate-700 tabular-nums">{contact.phone || departmentPhone}</td>
                          <td className="py-1.5 px-3 text-slate-600 text-xs">
                            {contact.email ? (
                              <span className="text-blue-700">{contact.email}</span>
                            ) : (
                              <span className="text-slate-500 italic">Not reported</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 4 Core Executive Metric Callouts */}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Executive operational and clinical indicators
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-lg border border-slate-200 bg-white">
                  <div className="text-xs text-slate-500 font-medium">Annual 911 transports</div>
                  <div className="text-[24px] font-[650] text-slate-900 mt-1 tabular-nums leading-none">
                    {reportNumber(agency.annual911Transports)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5 tabular-nums">
                    {reportNumber(agency.annualCallVolume)} dispatches &middot; Pop {reportNumber(agency.populationServed)}
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-white">
                  <div className="text-xs text-slate-500 font-medium">Installed defib fleet</div>
                  <div className="text-sm font-semibold text-slate-900 mt-1 truncate" title={agency.installedFleet?.defibBrand}>
                    {agency.installedFleet?.defibBrand || 'Not reported'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5 tabular-nums">
                    {reportNumber(agency.installedFleet?.defibUnitsCount)} devices &middot; Age: {reportNumber(agency.installedFleet?.defibAgeYears, ' yrs')}
                  </div>
                </div>

                <div className="print-planning-estimate p-3.5 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="text-xs text-emerald-800 font-medium">Billing recovery potential</div>
                  <div className="text-sm font-semibold text-slate-700 mt-1 tabular-nums leading-tight">
                    Estimate unavailable
                  </div>
                  <div className="text-xs text-slate-600 mt-1.5 tabular-nums">
                    Code {agency.cmsData?.topDenialReasonCode || 'Not reported'}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-1">No estimate shown without its inputs and method.</div>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-white">
                  <div className="text-xs text-slate-500 font-medium">Cardiac survival &amp; acuity</div>
                  <div className="text-[24px] font-[650] text-blue-900 mt-1 tabular-nums leading-none">
                    {reportNumber(agency.utsteinSurvivalRate, '%')}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5 tabular-nums">
                    {reportNumber(agency.annualCardiacArrestCalls)} OHCA calls &middot; AHA {agency.qualityMetrics?.ahaMissionLifelineTier || 'Not reported'}
                  </div>
                </div>
              </div>
            </div>

            {/* Pulse IQ Priority Score Breakdown */}
            <div className="print-planning-estimate p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900">
                    <PulseIqEstimateLabel /> · modeled priority index
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-white">
                    {agency.zollOpportunity?.priorityTier || 'Not calculated'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-white text-slate-700 border border-slate-300">
                    Stage: {agency.zollOpportunity?.salesStage || 'Not reported'}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-semibold text-slate-800 tabular-nums">
                    {reportNumber(agency.zollOpportunity?.pulseIqScore)}
                  </span>
                  <span className="text-xs text-slate-500">/ 100</span>
                </div>
              </div>

              {/* Four scored factors; the zero-weight claims explanation is not shown as a pillar. */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-1 border-t border-slate-300 text-xs">
                {scoreExplanation?.factors.filter((factor) => factor.weightPct > 0).map((f) => (
                  <div key={f.id} className="text-center p-2 rounded bg-white border border-slate-200">
                    <div className="text-slate-500 text-[11px] truncate">{f.name.split(' ')[0]} {f.name.split(' ')[1]}</div>
                    <div className="font-semibold text-slate-900 text-xs mt-0.5 tabular-nums">
                      +{f.pointsContributed} pts
                    </div>
                    <div className="text-[10px] text-slate-600 font-medium tabular-nums">
                      ({f.weightPct}% wt)
                    </div>
                  </div>
                ))}
              </div>

              {/* Strategic Rationale Narrative */}
              <div className="text-xs text-slate-700 leading-relaxed pt-1 border-t border-slate-300">
                <strong className="font-semibold text-slate-900">Strategic rationale:</strong> {agency.zollOpportunity?.scoreRationale || 'Agency-specific inputs and rationale are not reported.'}
              </div>
            </div>

            {/* Granular Apparatus & Vehicle Fleet Inventory */}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
                <span>Apparatus and emergency fleet breakdown</span>
                <span className="text-xs text-slate-600 tabular-nums">Total active units: {reportNumber(fleet?.totalActiveUnits)} &middot; Stations: {reportNumber(agency.stationsCount)}</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-medium">
                    <tr>
                      <th className="py-2 px-3">Vehicle apparatus classification</th>
                      <th className="py-2 px-3 text-center">Active count</th>
                      <th className="py-2 px-3">Primary equipment payload</th>
                      <th className="py-2 px-3">Lifecycle status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-900">Frontline ALS Ambulances (Type I/III)</td>
                      <td className="py-2 px-3 text-center font-semibold text-blue-900 tabular-nums">{reportNumber(fleet?.alsAmbulances)}</td>
                      <td className="py-2 px-3 text-slate-600">Advanced 12-Lead Monitor, Mechanical CPR, Transport Vent</td>
                      <td className="py-2 px-3 text-slate-700">7-Year High-Mileage Replacement Cycle</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-slate-900">Reserve / BLS Ambulances</td>
                      <td className="py-2 px-3 text-center text-slate-700 tabular-nums">{reportNumber(fleet?.blsAmbulances)}</td>
                      <td className="py-2 px-3 text-slate-600">Automated External Defibrillator (AED), BVM Airway</td>
                      <td className="py-2 px-3 text-slate-700">Secondary Peak-Volume Backup Units</td>
                    </tr>
                    {fleet?.fireEngines != null && fleet.fireEngines > 0 && (
                      <tr>
                        <td className="py-2 px-3 font-medium text-slate-900">Type 1 Fire Engines / Pumpers</td>
                        <td className="py-2 px-3 text-center text-slate-700 tabular-nums">{reportNumber(fleet.fireEngines)}</td>
                        <td className="py-2 px-3 text-slate-600">First-Response AED, Oxygen Resuscitation Pack</td>
                        <td className="py-2 px-3 text-slate-700">10-15 Year Frontline Service Standard</td>
                      </tr>
                    )}
                    {fleet?.ladderTrucks != null && fleet.ladderTrucks > 0 && (
                      <tr>
                        <td className="py-2 px-3 font-medium text-slate-900">Aerial Ladders / Platforms</td>
                        <td className="py-2 px-3 text-center text-slate-700 tabular-nums">{reportNumber(fleet.ladderTrucks)}</td>
                        <td className="py-2 px-3 text-slate-600">High-Angle Rescue, First-In Medical AED</td>
                        <td className="py-2 px-3 text-slate-700">Municipal Capital Depreciation Schedule</td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-2 px-3 font-medium text-slate-900">Heavy Rescue &amp; Extrication Squads</td>
                      <td className="py-2 px-3 text-center text-slate-700 tabular-nums">{reportNumber(fleet?.heavyRescueUnits)}</td>
                      <td className="py-2 px-3 text-slate-600">Full ALS Defibrillator &amp; Hydraulic Extrication</td>
                      <td className="py-2 px-3 text-slate-700">County Mutual Aid Technical Team</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium text-slate-900">Command &amp; EMS Supervisor Interceptors</td>
                      <td className="py-2 px-3 text-center text-slate-700 tabular-nums">{reportNumber(fleet?.commandVehicles)}</td>
                      <td className="py-2 px-3 text-slate-600">Supervisor Monitor-Defibrillator &amp; Incident Telemetry</td>
                      <td className="py-2 px-3 text-slate-700">Battalion Field Command Units</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hospital Trauma & Cath Lab Logistics Strip */}
            {(logistics?.primaryTraumaHospital || logistics?.distanceToTraumaMiles != null ||
              logistics?.transportTimeMinutes != null || logistics?.primaryCathLabHospital ||
              logistics?.cathLabDistanceMiles != null || logistics?.avgEdOffloadLatencyMinutes != null) && (
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <div className="text-xs text-slate-500 font-medium">Primary receiving trauma hospital</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">{logistics?.primaryTraumaHospital || 'Not reported'}</div>
                <div className="text-xs text-slate-600 mt-1 tabular-nums">
                  Driving distance: <strong className="font-medium text-slate-800">{reportNumber(logistics?.distanceToTraumaMiles, ' miles')}</strong> &middot; Transit time: <strong className="font-medium text-slate-800">{reportNumber(logistics?.transportTimeMinutes, ' mins')}</strong>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 font-medium">24/7 STEMI PCI cath lab destination</div>
                <div className="text-sm font-semibold text-slate-900 mt-0.5">{logistics?.primaryCathLabHospital || 'Not reported'}</div>
                <div className="text-xs text-slate-600 mt-1 tabular-nums">
                  Distance: <strong className="font-medium text-slate-800">{reportNumber(logistics?.cathLabDistanceMiles, ' miles')}</strong> &middot; Offload latency: <strong className="font-medium text-slate-800">{reportNumber(logistics?.avgEdOffloadLatencyMinutes, ' mins')}</strong>
                </div>
              </div>
            </div>
            )}

          </section>

          {/* ================= PAGE BREAK ================= */}
          {includedSections.overview && (includedSections.clinical || includedSections.commercial) && (
            <div className="dossier-page-break my-8 border-b-2 border-dashed border-slate-300" />
          )}

          {/* ================= PAGE 2: CLINICAL QUALITY, CMS REIMBURSEMENT & INCUMBENT CONTRACT ================= */}
          <section
            data-report-section="clinical"
            hidden={!includedSections.clinical}
            className="space-y-5 pt-2"
          >
            
            {/* Header for Page 2 */}
            <div className="flex items-center justify-between border-b border-slate-300 pb-3">
              <div>
                <span className="text-xs text-slate-500 font-medium">
                  {agency.name} &middot; Executive briefing (Page 2)
                </span>
                <h3 className="text-lg font-semibold text-slate-900">Clinical resuscitation quality, CMS denials &amp; contract timeline</h3>
              </div>
              <div className="text-xs text-slate-600 tabular-nums">
                {agency.npiNumber ? `NPI #${agency.npiNumber}` : 'NPI: Unassigned'} &middot; FDID: {agency.fdid || 'Not reported'}
              </div>
            </div>

            {/* 1. Clinical Resuscitation Quality Metrics (CARES & NEMSQA Benchmarks) */}
            {(agency.qualityMetrics?.nemsqaStemi12LeadAcquisitionPct != null ||
              agency.qualityMetrics?.nemsqaChestCompressionFractionPct != null ||
              agency.qualityMetrics?.nemsqaEtco2VentilationCompliancePct != null ||
              agency.qualityMetrics?.nemsqaPediatricRespiratorySupportPct != null ||
              agency.qualityMetrics?.ahaMissionLifelineTier) && (
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
                <span>NEMSQA clinical quality measures &amp; CARES neurological survival</span>
                <span className="text-xs text-emerald-800 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  AHA Mission: Lifeline {agency.qualityMetrics?.ahaMissionLifelineTier || 'Not reported'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-lg border border-slate-200 bg-white">
                  <div className="text-xs text-slate-500 font-medium">STEMI 12-lead acquisition</div>
                  <div className="text-[24px] font-[650] text-blue-900 mt-1 tabular-nums leading-none">
                    {reportNumber(agency.qualityMetrics?.nemsqaStemi12LeadAcquisitionPct, '%')}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5 tabular-nums">
                    Target: &ge;85% within &le;10 min
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-white">
                  <div className="text-xs text-slate-500 font-medium">Chest compression fraction</div>
                  <div className="text-[24px] font-[650] text-emerald-800 mt-1 tabular-nums leading-none">
                    {reportNumber(agency.qualityMetrics?.nemsqaChestCompressionFractionPct, '%')}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5 tabular-nums">
                    Target: &ge;78% (AutoPulse 98%)
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-white">
                  <div className="text-xs text-slate-500 font-medium">ETCO2 ventilation compliance</div>
                  <div className="text-[24px] font-[650] text-amber-800 mt-1 tabular-nums leading-none">
                    {reportNumber(agency.qualityMetrics?.nemsqaEtco2VentilationCompliancePct, '%')}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5 tabular-nums">
                    Target: &ge;64% (Real BVM Help)
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-200 bg-white">
                  <div className="text-xs text-slate-500 font-medium">Pediatric respiratory support</div>
                  <div className="text-[24px] font-[650] text-purple-900 mt-1 tabular-nums leading-none">
                    {reportNumber(agency.qualityMetrics?.nemsqaPediatricRespiratorySupportPct, '%')}
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5 tabular-nums">
                    Target: &ge;72% pediatric standard
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* 2. CMS Medicare & Commercial Insurance Reimbursement Analysis */}
            <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-emerald-900 font-medium">
                    CMS reimbursement &amp; revenue recovery analytics
                  </span>
                  <h4 className="text-base font-semibold text-slate-900 mt-0.5">
                    Medicare billing claim details
                  </h4>
                  {denialMetric && (
                    <p className="mt-1 text-xs text-slate-600">
                      NPI {denialMetric.npi} · {denialMetric.deniedClaimCount.toLocaleString()} denied / {denialMetric.adjudicatedClaimCount.toLocaleString()} adjudicated · {denialMetric.reportingPeriod} · {denialMetric.claimScope} · {denialMetric.denialDefinition}. Source: {denialMetric.source}{denialMetric.sourceReference ? ` · ${denialMetric.sourceReference}` : ''}{denialMetric.sourceUrl ? ` · ${denialMetric.sourceUrl}` : ''}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className="print-planning-estimate text-xs text-slate-600 font-medium">Estimated annual recoverable cash:</span>
                  <div className="print-planning-estimate text-sm font-semibold text-slate-700 tabular-nums leading-tight mt-0.5">
                    Not reported: estimate inputs and method unavailable
                  </div>
                </div>
              </div>

              {/* Payer Mix Distribution Bar */}
              <div className="space-y-1.5 pt-2 border-t border-emerald-200">
                <div className="flex items-center justify-between text-xs text-slate-700 font-medium">
                  <span>Payer mix breakdown:</span>
                  <span className="text-slate-500 text-xs tabular-nums">
                    GADCS status: {agency.cmsData?.gadcsReportingStatus || 'Not reported'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <div className="text-xs text-slate-500 font-medium">Medicare</div>
                    <div className="font-semibold text-slate-900 text-sm mt-0.5 tabular-nums">
                      {reportNumber(agency.cmsData?.medicarePayerPct ?? agency.cmsData?.payerMix?.medicare, '%')}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <div className="text-xs text-slate-500 font-medium">Medicaid</div>
                    <div className="font-semibold text-slate-900 text-sm mt-0.5 tabular-nums">
                      {reportNumber(agency.cmsData?.medicaidPayerPct ?? agency.cmsData?.payerMix?.medicaid, '%')}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <div className="text-xs text-slate-500 font-medium">Commercial</div>
                    <div className="font-semibold text-slate-900 text-sm mt-0.5 tabular-nums">
                      {reportNumber(agency.cmsData?.commercialPayerMixPct ?? agency.cmsData?.payerMix?.commercial, '%')}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-white border border-slate-200">
                    <div className="text-xs text-slate-500 font-medium">Self-Pay / Other</div>
                    <div className="font-semibold text-slate-900 text-sm mt-0.5 tabular-nums">
                      {reportNumber(agency.cmsData?.selfPayPayerPct ?? agency.cmsData?.payerMix?.selfPay, '%')}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-700 mt-2">
                  <strong className="font-semibold text-slate-900">Primary denial reason:</strong> {agency.cmsData?.topDenialReason || 'Not reported'} ({agency.cmsData?.topDenialReasonCode || 'Not reported'}).
                </div>
              </div>
            </div>

            {/* 3. Competitive Service Contract Expiration Timeline */}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
                <span>Incumbent service contract expiration timeline</span>
                <span className="text-amber-700 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs tabular-nums">
                  {agency.competitorContract?.status || 'Not reported'}
                </span>
              </div>
              <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 text-xs space-y-2">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Incumbent provider</div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5">
                      {agency.competitorContract?.vendor || 'Not reported'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Expiration date</div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5 tabular-nums">
                      {agency.competitorContract?.contractEndDate || 'Not reported'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Renewal window</div>
                    <div className="text-sm font-semibold text-amber-800 mt-0.5 tabular-nums">
                      {reportNumber(agency.competitorContract?.renewalWindowDays, ' days')}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-700 pt-2 border-t border-amber-200/70">
                  <strong className="font-semibold text-slate-900">Recommended action:</strong> {agency.competitorContract?.actionRecommendation || 'Not reported'}
                </div>
              </div>
            </div>

            {/* 4. Recent Sales Representative Field Notes & Strategy */}
            {agency.fieldNotes && agency.fieldNotes.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">
                  User-recorded field notes (not independently verified)
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-medium">
                      <tr>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Interaction</th>
                        <th className="py-2 px-3">Field notes</th>
                        <th className="py-2 px-3">Next action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800">
                      {agency.fieldNotes.slice(0, 3).map((note) => (
                        <tr key={note.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium text-slate-900 whitespace-nowrap tabular-nums">{note.date}</td>
                          <td className="py-2 px-3 font-medium text-slate-800 whitespace-nowrap">{note.meetingType}</td>
                          <td className="py-2 px-3 text-slate-600 max-w-sm">{note.notes}</td>
                          <td className="py-2 px-3 font-medium text-blue-900">
                            {note.nextAction} <span className="text-slate-500 text-xs tabular-nums">({note.dueDate})</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </section>

          {/* ================= PAGE BREAK ================= */}
          {includedSections.clinical && includedSections.commercial && (
            <div className="dossier-page-break my-8 border-b-2 border-dashed border-slate-300" />
          )}

          {/* ================= PAGE 3: COMMERCIAL TCO, MEDICARE HCPCS & COOPERATIVE PURCHASING ================= */}
          <section
            data-report-section="commercial"
            hidden={!includedSections.commercial}
            className="space-y-5 pt-2"
          >
            
            {/* Header for Page 3 */}
            <div className="flex items-center justify-between border-b border-slate-300 pb-3">
              <div>
                <span className="text-xs text-slate-500 font-medium">
                  {agency.name} &middot; Executive briefing (Page 3)
                </span>
                <h3 className="text-lg font-semibold text-slate-900">Commercial TCO, Medicare fee schedule &amp; cooperative purchasing</h3>
              </div>
              <div className="text-xs text-slate-600 tabular-nums">
                {agency.npiNumber ? `Federal NPI #${agency.npiNumber}` : 'Federal NPI: Unassigned'}
              </div>
            </div>

            {/* 1. 5-Year Hardware Replacement TCO Comparison */}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
                <span>5-year total cost of ownership: ZOLL upgrade vs. incumbent fleet</span>
                <span className="print-planning-estimate font-medium text-slate-700 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded text-[10px] tabular-nums">
                  Modeled estimate · net 5-year savings: {tcoModel ? formatTcoValue(tcoModel.totalSavingsIncludingTradeIn) : 'Not calculated'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {tcoModel
                  ? `Illustrative estimate, not reported agency spending. Inputs: ${tcoModel.unitCount} reported defibrillator units and five years; benchmark ${tcoModel.incumbentModel} vs ${tcoModel.zollModel}; per-unit annual service ${formatTcoValue(tcoModel.matchedIntel.incumbentAnnualServicePerUnit)} vs ${formatTcoValue(tcoModel.matchedIntel.zollAnnualServicePerUnit)}, 5-year batteries ${formatTcoValue(tcoModel.matchedIntel.incumbentBattery5YrCostPerUnit)} vs ${formatTcoValue(tcoModel.matchedIntel.zollBattery5YrCostPerUnit)}, annual consumables ${formatTcoValue(tcoModel.matchedIntel.incumbentConsumableAnnualPerUnit)} vs ${formatTcoValue(tcoModel.matchedIntel.zollConsumableAnnualPerUnit)}, and trade-in assumption ${formatTcoValue(tcoModel.matchedIntel.zollTradeInCreditPerUnit)}/unit. Method: five-year service, battery, and consumables cost difference plus modeled trade-in credit.`
                  : agency.installedFleet?.defibUnitsCount != null && Number.isFinite(agency.installedFleet.defibUnitsCount)
                    ? 'Not calculated: 0 defibrillator units reported.'
                    : 'Not calculated: defibrillator unit count not reported.'}
              </p>
              {hasTcoInputs ? <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-medium">
                    <tr>
                      <th className="py-2.5 px-3">TCO cost component</th>
                      <th className="py-2.5 px-3">Incumbent ({tcoModel?.incumbentModel || agency.installedFleet?.defibBrand || 'Not reported'})</th>
                      <th className="py-2.5 px-3">ZOLL {tcoModel?.zollModel || 'model not selected'}</th>
                      <th className="py-2.5 px-3 text-right">5-year savings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-900">Preventive maintenance &amp; factory service</td>
                      <td className="py-2.5 px-3 text-slate-700 tabular-nums">{formatTcoValue(tcoModel?.incumbentServiceTotal)}</td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium tabular-nums">{formatTcoValue(tcoModel?.zollServiceTotal)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 tabular-nums">
                        {hasTcoInputs ? `+${formatTcoValue(tcoModel!.incumbentServiceTotal - tcoModel!.zollServiceTotal)}` : 'Not calculated'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-900">Lithium-ion batteries &amp; smart chargers</td>
                      <td className="py-2.5 px-3 text-slate-700 tabular-nums">{formatTcoValue(tcoModel?.incumbentBatteryTotal)}</td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium tabular-nums">{formatTcoValue(tcoModel?.zollBatteryTotal)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 tabular-nums">
                        {hasTcoInputs ? `+${formatTcoValue(tcoModel!.incumbentBatteryTotal - tcoModel!.zollBatteryTotal)}` : 'Not calculated'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-900">CPR sensors &amp; clinical electrodes</td>
                      <td className="py-2.5 px-3 text-slate-700 tabular-nums">{formatTcoValue(tcoModel?.incumbentConsumablesTotal)}</td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium tabular-nums">{formatTcoValue(tcoModel?.zollConsumablesTotal)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 tabular-nums">
                        {hasTcoInputs ? `+${formatTcoValue(tcoModel!.incumbentConsumablesTotal - tcoModel!.zollConsumablesTotal)}` : 'Not calculated'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-900">ZOLL fleet trade-in credit allowance</td>
                      <td className="py-2.5 px-3 text-slate-400 tabular-nums">{formatTcoValue(0)}</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-semibold tabular-nums">
                        {hasTcoInputs ? `-${formatTcoValue(tcoModel!.totalTradeInCredit)}` : 'Not calculated'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 tabular-nums">
                        {hasTcoInputs ? `+${formatTcoValue(tcoModel!.totalTradeInCredit)}` : 'Not calculated'}
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/60 font-semibold border-t-2 border-emerald-300">
                      <td className="py-3 px-3 text-emerald-950 font-semibold">Net 5-year financial advantage</td>
                      <td className="py-3 px-3 text-slate-700 tabular-nums">{formatTcoValue(tcoModel?.incumbentOperatingTotal)}</td>
                      <td className="py-3 px-3 text-emerald-900 tabular-nums">{formatTcoValue(tcoModel?.zollNetOperatingTotal)}</td>
                      <td className="py-3 px-3 text-right font-semibold text-emerald-700 text-sm tabular-nums">
                        {hasTcoInputs ? `+${formatTcoValue(tcoModel!.totalSavingsIncludingTradeIn)} net savings` : 'Not calculated'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div> : (
                <p className="text-xs text-slate-600">
                  Cost comparison omitted because a positive defibrillator unit count is not reported.
                </p>
              )}
            </div>

            {/* 2. Medicare HCPCS Procedure-Level Denial Breakdown */}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
                <span>Medicare &amp; insurance reimbursement recovery (HCPCS fee schedule)</span>
                <span className="print-planning-estimate text-slate-600 font-medium tabular-nums text-[10px]">
                  Annual denial exposure: Not calculated from local claim percentages
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {hcpcsModel
                  ? `Estimate inputs: ${hcpcsModel.inputs.annualTransports.toLocaleString()} reported transports and ${hcpcsModel.inputs.medicarePayerPct}% Medicare payer share. Method: ${hcpcsModel.inputs.method}`
                  : 'Not calculated: reported annual transports and Medicare payer share are required.'}
              </p>
              {hcpcsModel?.procedures.length ? <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-medium">
                    <tr>
                      <th className="py-2 px-3">HCPCS code</th>
                      <th className="py-2 px-3">Procedure descriptor</th>
                      <th className="py-2 px-3 text-right">Annual runs</th>
                      <th className="py-2 px-3 text-right">Gross billing</th>
                      <th className="py-2 px-3 text-right">Denial loss</th>
                      <th className="py-2 px-3">Automated documentation mitigation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    {hcpcsModel?.procedures.map((p) => (
                      <tr key={p.code} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium text-slate-900 tabular-nums">{p.code}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{p.descriptor}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{p.estimatedAnnualClaims.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right text-slate-700 tabular-nums">${p.grossAnnualBilling.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-500 tabular-nums">
                          {p.annualRevenueAtRisk == null ? 'Not calculated' : `-$${p.annualRevenueAtRisk.toLocaleString()}`}
                        </td>
                        <td className="py-2 px-3 text-xs text-slate-600 max-w-xs">{p.zollDocumentationMitigation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div> : (
                <p className="text-xs text-slate-600">
                  No procedure estimates are shown because required agency inputs are unavailable.
                </p>
              )}
            </div>

            {/* 3. Competitive Battlecard Specs & RFP Cooperative Purchasing Vehicles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              
              {/* Left Column: Head-to-Head Battlecard */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-xs">
                  <Scale className="w-4 h-4 text-[#1E3A8A]" />
                  <span>Head-to-head specification comparison</span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-white border border-slate-200">
                    <span className="text-slate-700">Physical weight:</span>
                    <span className="font-medium text-[#1E3A8A] tabular-nums">
                      11.7 lbs (ZOLL) vs. 18.5 lbs ({agency.installedFleet?.defibBrand.split(' ')[0]})
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-white border border-slate-200">
                    <span className="text-slate-700">Battery runtime capacity:</span>
                    <span className="font-medium text-[#1E3A8A] tabular-nums">5.7 hours vs. 2.1 hours</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-white border border-slate-200">
                    <span className="text-slate-700">CPR feedback system:</span>
                    <span className="font-medium text-emerald-700">Real CPR Help (depth and rate)</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-white border border-slate-200">
                    <span className="text-slate-700">Ventilation feedback:</span>
                    <span className="font-medium text-emerald-700">Real BVM Help (volume and rate)</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-white border border-slate-200">
                    <span className="text-slate-700">Contract renewal window:</span>
                    <span className="font-medium text-amber-700 tabular-nums">
                      {reportNumber(agency.competitorContract?.renewalWindowDays, ' days')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Cooperative Purchasing RFP Bypass & FEMA Grants */}
              <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2.5">
                <div className="flex items-center gap-2 text-blue-950 font-semibold text-xs">
                  <ShieldCheck className="w-4 h-4 text-blue-700" />
                  <span>Cooperative purchasing vehicles (buy without RFP)</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2 rounded bg-white border border-blue-100">
                    <div className="font-semibold text-slate-900">Sourcewell master contract #011822-ZLL</div>
                    <div className="text-slate-600 text-xs mt-0.5">
                      National competitively solicited contract allowing municipal procurement without the extended public RFP bidding process.
                    </div>
                  </div>

                  <div className="p-2 rounded bg-white border border-blue-100">
                    <div className="font-semibold text-slate-900">NPPGov public safety agreement #PS20045</div>
                    <div className="text-slate-600 text-xs mt-0.5">
                      Intergovernmental cooperative purchasing vehicle guaranteeing tiered municipal volume discounts on X Series &amp; AutoPulse.
                    </div>
                  </div>

                  <div className="p-2 rounded bg-white border border-blue-100">
                    <div className="font-semibold text-slate-900">FEMA AFG program overview</div>
                    <div className="text-slate-600 text-xs mt-0.5">
                      Match requirements and eligibility depend on the current program notice. No agency-specific eligibility or funding estimate is shown here.
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* 4. Multi-Year FEMA AFG Grant Award History */}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
                <span>FEMA AFG &amp; federal grant awards (reported records)</span>
                  <span className="text-xs text-slate-500">Record and review status vary; see source references</span>
              </div>
              {femaGrants.length > 0 ? <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-medium">
                    <tr>
                      <th className="py-2 px-3">Fiscal year</th>
                      <th className="py-2 px-3">Grant program</th>
                      <th className="py-2 px-3">Funded scope</th>
                      <th className="py-2 px-3 text-right">Award amount</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    {femaGrants.map((g, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium text-slate-900 tabular-nums">FY{g.fiscalYear}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{g.programName}</td>
                        <td className="py-2 px-3 text-slate-600 max-w-xs">{g.purpose}</td>
                        <td className="py-2 px-3 text-right font-medium text-slate-900 tabular-nums">
                          ${g.awardAmount.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            data-status-kind={g.status.includes('Disbursed')
                              ? 'disbursed'
                              : g.status.includes('Active')
                                ? 'active'
                                : 'planned'}
                            className={`print-status-badge px-2 py-0.5 rounded text-xs font-medium ${
                            g.status.includes('Disbursed')
                              ? 'bg-emerald-100 text-emerald-800'
                              : g.status.includes('Active')
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}>
                            {g.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div> : (
                <p className="text-xs text-slate-600">
                  No grant records are attached to this profile. This does not indicate that the agency has no awards.
                </p>
              )}
            </div>

          </section>

          <section
            data-report-section="sources"
            hidden={!includedSections.sources}
            className="print-source-references pt-3 border-t-2 border-slate-900 text-xs text-slate-700"
          >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold text-slate-900">Agency source references</h2>
                <span className="text-[10px] text-slate-600">
                  Source citations show provenance. A review marker records user activity; neither independently verifies a fact.
                </span>
              </div>
              {sourceReferences.length > 0 ? (
                <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                  {sourceReferences.map((reference, index) => {
                    const sourceUrl = printableSourceUrl(reference.url);
                    const normalizedStatus = reference.status.toLowerCase();
                    const statusKind = /review marker|confirmed/.test(normalizedStatus)
                      ? 'reviewed'
                      : /incomplete|rejected/.test(normalizedStatus)
                        ? 'warning'
                        : normalizedStatus.includes('mapped')
                          ? 'mapped'
                          : normalizedStatus.includes('calculated')
                            ? 'calculated'
                            : normalizedStatus.includes('user-entered')
                              ? 'user-entered'
                              : 'reported';
                    return <li key={`${reference.label}-${reference.sourceName}-${index}`} className="min-w-0 break-words">
                      <div className="font-semibold text-slate-900">
                        {reference.label} ·{' '}
                        <span className="print-status-badge" data-status-kind={statusKind}>
                          {reference.status}
                        </span>
                      </div>
                      <div>{reference.sourceName}</div>
                      <div className="text-slate-600">
                        {reference.periodLabel}: {reference.period || 'Not stated'}
                      </div>
                      {reference.detail && <div className="text-slate-600">{reference.detail}</div>}
                      {sourceUrl ? (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="print-source-url text-blue-800 underline"
                        >
                          {sourceUrl}
                        </a>
                      ) : (
                        <div className="text-slate-500">Source link not provided</div>
                      )}
                    </li>
                  })}
                </ul>
              ) : (
                <p className="mt-2">No field-level source references are attached to this agency profile.</p>
              )}
              <div className="mt-3 border-t border-slate-300 pt-2 text-[10px] text-slate-600">
                Nick&apos;s EMS &amp; Fire Territory Intelligence · Brief prepared {currentDate}
              </div>
          </section>

        </div>

      </div>

      {/* Embedded Global CSS for Flawless Print / Save as PDF Functionality */}
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 12mm;
          }

          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .pi-app-shell {
            display: block !important;
            height: auto !important;
            min-height: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          .pi-app-shell > :not(.provider-profile-overlay) {
            display: none !important;
          }

          .provider-profile-overlay {
            position: static !important;
            inset: auto !important;
            display: block !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }

          .provider-profile-overlay > :not(#briefing-dossier-modal-container) {
            display: none !important;
          }

          body * {
            visibility: hidden !important;
          }

          #briefing-dossier-modal-container,
          #briefing-dossier-modal-container * {
            visibility: visible !important;
          }

          #briefing-dossier-modal-container {
            position: static !important;
            display: block !important;
            visibility: visible !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
          }

          #briefing-dossier-modal-container .no-print {
            display: none !important;
          }

          #briefing-dossier-modal-container > div {
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
          }

          .print-dossier-document {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-shadow: none !important;
            border: none !important;
            font-size: 9pt !important;
            line-height: 1.3 !important;
          }

          #briefing-dossier-modal-container .print-dossier-document {
            color-scheme: light !important;
            color: #111827 !important;
            background: #ffffff !important;
          }

          #briefing-dossier-modal-container .print-dossier-document * {
            color: #334155 !important;
            background-color: transparent !important;
            border-color: #cbd5e1 !important;
          }

          #briefing-dossier-modal-container .print-dossier-document h1,
          #briefing-dossier-modal-container .print-dossier-document h2,
          #briefing-dossier-modal-container .print-dossier-document h3,
          #briefing-dossier-modal-container .print-dossier-document strong,
          #briefing-dossier-modal-container .print-dossier-document th {
            color: #111827 !important;
          }

          #briefing-dossier-modal-container .print-dossier-document a {
            color: #1d4ed8 !important;
            text-decoration: underline !important;
            overflow-wrap: anywhere !important;
          }

          #briefing-dossier-modal-container .print-dossier-document .print-status-badge {
            display: inline-flex !important;
            align-items: center !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 4px !important;
            padding: 2px 6px !important;
            font-weight: 700 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          #briefing-dossier-modal-container .print-dossier-document .print-status-badge[data-status-kind="fire"] {
            color: #991b1b !important;
            background: #fee2e2 !important;
            border-color: #fca5a5 !important;
          }

          #briefing-dossier-modal-container .print-dossier-document .print-status-badge[data-status-kind="ems"] {
            color: #1e3a8a !important;
            background: #dbeafe !important;
            border-color: #93c5fd !important;
          }

          #briefing-dossier-modal-container .print-dossier-document .print-status-badge[data-status-kind="reviewed"],
          #briefing-dossier-modal-container .print-dossier-document .print-status-badge[data-status-kind="disbursed"] {
            color: #166534 !important;
            background: #dcfce7 !important;
            border-color: #86efac !important;
          }

          #briefing-dossier-modal-container .print-dossier-document .print-status-badge[data-status-kind="mapped"],
          #briefing-dossier-modal-container .print-dossier-document .print-status-badge[data-status-kind="reported"],
          #briefing-dossier-modal-container .print-dossier-document .print-status-badge[data-status-kind="active"] {
            color: #1e40af !important;
            background: #dbeafe !important;
            border-color: #93c5fd !important;
          }

          #briefing-dossier-modal-container .print-dossier-document .print-status-badge[data-status-kind="warning"],
          #briefing-dossier-modal-container .print-dossier-document .print-status-badge[data-status-kind="planned"] {
            color: #92400e !important;
            background: #fef3c7 !important;
            border-color: #fcd34d !important;
          }

          #briefing-dossier-modal-container .print-dossier-document .print-status-badge[data-status-kind="calculated"] {
            color: #5b21b6 !important;
            background: #ede9fe !important;
            border-color: #c4b5fd !important;
          }

          #briefing-dossier-modal-container .print-dossier-document .print-status-badge[data-status-kind="user-entered"] {
            color: #6b21a8 !important;
            background: #f3e8ff !important;
            border-color: #d8b4fe !important;
          }

          #briefing-dossier-modal-container .print-dossier-document .dossier-page-break {
            display: block !important;
            break-before: page !important;
            page-break-before: always !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            border: 0 !important;
          }

          .print-summary,
          .print-profile-review,
          .print-source-references li,
          tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .print-dossier-document .space-y-5 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.55rem !important;
          }

          .print-dossier-document .p-3\\.5,
          .print-dossier-document .p-4 {
            padding: 0.5rem !important;
          }

          .print-dossier-document .text-\\[24px\\] {
            font-size: 16pt !important;
          }

          .print-dossier-document .overflow-x-auto {
            overflow: visible !important;
          }

          .print-dossier-document table {
            width: 100% !important;
            table-layout: fixed;
            font-size: 7.5pt !important;
          }

          .print-dossier-document th,
          .print-dossier-document td {
            padding: 0.2rem 0.25rem !important;
            overflow-wrap: anywhere;
            vertical-align: top;
          }

          .print-dossier-document .print-source-url {
            display: block;
            color: #1e3a8a !important;
            font-size: 7pt !important;
            overflow-wrap: anywhere;
          }

          .print-agency-identity {
            gap: 0.5rem !important;
            padding-bottom: 0.5rem !important;
          }

          .print-agency-identity img {
            width: 3rem !important;
            height: 3rem !important;
          }

          .print-agency-identity h1 {
            font-size: 20pt !important;
          }

          .print-agency-identifiers {
            border-top: 1px solid #e2e8f0 !important;
            padding-top: 0.2rem !important;
            color: #64748b !important;
            font-size: 7pt !important;
          }

          .print-summary {
            border-left: 4px solid #1e3a8a !important;
            background: #f8fafc !important;
          }

          .print-summary-value {
            color: #0f172a !important;
            font-size: 11pt !important;
            font-weight: 700 !important;
          }

          .print-profile-review {
            color: #64748b !important;
            font-size: 7pt !important;
          }

          .print-planning-estimate {
            background: #f8fafc !important;
            border-color: #cbd5e1 !important;
            color: #475569 !important;
            box-shadow: none !important;
          }

          .print-dossier-document .grid {
            gap: 0.35rem !important;
          }

          .print-dossier-document p,
          .print-dossier-document li {
            overflow-wrap: anywhere;
          }

          .print-dossier-document a {
            text-decoration: underline;
            color: #1e3a8a !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
};
