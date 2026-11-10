import React from 'react';
import {
  Activity, Ambulance, BadgeDollarSign, Building2, CalendarDays, CalendarClock,
  Info, ClipboardList, FileCheck2, FileText, Flame, HeartPulse, Hospital,
  Landmark, Layers, Mail, MapPin, MapPinned, Navigation, Phone, Radio, Route,
  Shield, Siren, Stethoscope, Target, Timer, Truck, Users, Wallet, Wrench,
  type LucideIcon,
} from 'lucide-react';

/** Semantic vocabulary shared by metrics, table headings, facts and profile sheets.
 * An icon identifies the topic, never whether a value is good, bad or confirmed.
 */
export const DATA_LABELS = {
  population: { label: 'Population', icon: Users },
  personnel: { label: 'Personnel', icon: Users },
  age: { label: 'Age 65+', icon: Users },
  transports: { label: 'EMS transports', icon: Ambulance },
  transportTime: { label: 'Average EMS transport', icon: Timer },
  cardiac: { label: 'Cardiac arrests', icon: HeartPulse },
  survival: { label: 'Survival rate', icon: Activity },
  calls: { label: 'Calls / dispatches', icon: Radio },
  incidents: { label: 'Incidents', icon: Siren },
  stations: { label: 'Stations', icon: Building2 },
  ambulances: { label: 'Ambulances', icon: Ambulance },
  apparatus: { label: 'Fire apparatus', icon: Truck },
  fire: { label: 'Fire department', icon: Flame },
  agency: { label: 'Agency', icon: Building2 },
  service: { label: 'Service level', icon: Stethoscope },
  equipment: { label: 'Equipment', icon: Wrench },
  monitor: { label: 'Monitor / defibrillator', icon: HeartPulse },
  maintenance: { label: 'Maintenance', icon: Wrench },
  software: { label: 'Software system', icon: Layers },
  warranty: { label: 'Warranty', icon: Shield },
  contract: { label: 'Contract', icon: FileText },
  expiration: { label: 'Contract end date', icon: CalendarClock },
  budget: { label: 'Budget', icon: Wallet },
  income: { label: 'Median household income', icon: Wallet },
  poverty: { label: 'Poverty rate', icon: Users },
  funding: { label: 'Funding', icon: Landmark },
  cost: { label: 'Cost', icon: BadgeDollarSign },
  savings: { label: 'Estimated savings', icon: Wallet },
  claims: { label: 'Claims', icon: ClipboardList },
  clinical: { label: 'Clinical outcomes', icon: Stethoscope },
  hospital: { label: 'Receiving hospital', icon: Hospital },
  distance: { label: 'Distance', icon: Route },
  location: { label: 'Location', icon: MapPin },
  area: { label: 'Land area', icon: MapPinned },
  coordinates: { label: 'Coordinates', icon: Navigation },
  places: { label: 'Mapped places', icon: MapPin },
  zip: { label: 'ZIP codes', icon: MapPin },
  identifier: { label: 'Record ID', icon: FileText },
  source: { label: 'Sources', icon: FileText },
  review: { label: 'User review', icon: FileCheck2 },
  period: { label: 'Reporting period', icon: CalendarDays },
  risk: { label: 'Source-defined risk', icon: Shield },
  resilience: { label: 'Community resilience', icon: Shield },
  vulnerability: { label: 'Social vulnerability', icon: Users },
  score: { label: 'Score', icon: Target },
  coverage: { label: 'Coverage', icon: Layers },
  contact: { label: 'Contact', icon: Users },
  phone: { label: 'Phone', icon: Phone },
  email: { label: 'Email', icon: Mail },
  visit: { label: 'Visit', icon: CalendarDays },
  notes: { label: 'Notes', icon: ClipboardList },
  info: { label: 'Information', icon: Info },
} satisfies Record<string, { label: string; icon: LucideIcon }>;

export type DataLabelKind = keyof typeof DATA_LABELS;

/** Topic tone families. Tones identify subject matter only, never performance or risk. */
export type DataLabelTone = 'operations' | 'community' | 'planning' | 'clinical' | 'reference';
const TONE_KINDS: Record<Exclude<DataLabelTone, 'reference'>, DataLabelKind[]> = {
  operations: ['personnel', 'transports', 'transportTime', 'calls', 'incidents', 'stations', 'ambulances', 'apparatus', 'fire', 'agency', 'service'],
  community: ['population', 'age', 'income', 'poverty', 'distance', 'location', 'area', 'coordinates', 'places', 'zip', 'resilience', 'vulnerability'],
  planning: ['equipment', 'maintenance', 'software', 'warranty', 'contract', 'expiration', 'budget', 'funding', 'cost', 'savings', 'claims', 'score', 'coverage'],
  clinical: ['cardiac', 'survival', 'clinical', 'hospital', 'monitor'],
};
export function dataLabelTone(kind: DataLabelKind): DataLabelTone {
  for (const [tone, kinds] of Object.entries(TONE_KINDS)) if (kinds.includes(kind)) return tone as DataLabelTone;
  return 'reference';
}

/** Conservative label inference for generic metric components. Explicit kinds win. */
export function inferDataLabelKind(label: string): DataLabelKind {
  const text = label.toLowerCase();
  const rules: [RegExp, DataLabelKind][] = [
    [/cardiac|ohca|arrest/, 'cardiac'], [/survival|utstein/, 'survival'],
    [/transport.*(time|min)|avg.*transport|average.*transport/, 'transportTime'],
    [/transport/, 'transports'], [/ambulance/, 'ambulances'],
    [/population/, 'population'], [/65\+|age 65/, 'age'],
    [/personnel|staff|paramedic|firefighter/, 'personnel'], [/station/, 'stations'],
    [/software|epcr|cad system/, 'software'],
    [/apparatus|engine|ladder|fleet unit/, 'apparatus'], [/calls|dispatch/, 'calls'],
    [/incident|response volume/, 'incidents'], [/income/, 'income'], [/poverty/, 'poverty'],
    [/warranty/, 'warranty'], [/expir|end date|renewal/, 'expiration'],
    [/contract|vendor/, 'contract'], [/defib|monitor/, 'monitor'],
    [/equipment|fleet|hardware/, 'equipment'], [/maintenance/, 'maintenance'],
    [/budget/, 'budget'], [/grant|funding|award/, 'funding'],
    [/saving/, 'savings'], [/cost|capex|spend|revenue|loss|dollar/, 'cost'],
    [/claim|medicare|billing/, 'claims'], [/clinical|cpr|stemi|ecg|etco|ventilation|compression|neurological|lifeline/, 'clinical'],
    [/distance|cath lab/, 'distance'], [/hospital/, 'hospital'],
    [/centroid|latitude|longitude|coordinate/, 'coordinates'], [/zip/, 'zip'],
    [/places|cities|county seat/, 'places'], [/area|sq mi/, 'area'],
    [/fips|fdid|npi|taxonomy|identifier|hcpcs|license|licence/, 'identifier'],
    [/source|evidence|citation/, 'source'], [/review|confirm/, 'review'],
    [/vintage|period|updated|date|fiscal|year/, 'period'],
    [/resilien/, 'resilience'], [/vulnerab/, 'vulnerability'], [/risk|hazard/, 'risk'],
    [/score|priority|pulseiq/, 'score'], [/coverage/, 'coverage'],
    [/phone/, 'phone'], [/email/, 'email'], [/contact|leadership|decision.maker|functional role|command/, 'contact'],
    [/visit|meeting/, 'visit'], [/note/, 'notes'], [/agency|provider|department/, 'agency'],
    [/location|address|geograph/, 'location'], [/service|als|bls/, 'service'],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? 'info';
}

export interface DataLabelProps {
  kind?: DataLabelKind;
  children?: React.ReactNode;
  className?: string;
  iconClassName?: string;
}

export function DataLabel({ kind, children, className = '', iconClassName = '' }: DataLabelProps) {
  const resolved = kind ?? (typeof children === 'string' ? inferDataLabelKind(children) : 'info');
  const { icon: Icon, label } = DATA_LABELS[resolved];
  return (
    <span className={`pi-data-label ${className}`} data-label-kind={resolved} data-label-tone={dataLabelTone(resolved)}>
      <Icon className={`pi-data-label-icon ${iconClassName}`} aria-hidden="true" focusable="false" />
      <span>{children ?? label}</span>
    </span>
  );
}
