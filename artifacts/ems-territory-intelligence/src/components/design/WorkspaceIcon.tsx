import React from 'react';
import {Globe2, Building2, Route, ChartNoAxesCombined, Settings2, ClipboardList, BadgeDollarSign, Gauge, HeartPulse, Boxes, Database, ShieldCheck, ArchiveRestore, MapPinned, ListFilter, RadioTower, CalendarCheck, BookOpen, type LucideIcon} from 'lucide-react';
/** One meaning per symbol across navigation, tool destinations, and workspace headings. */
export const WORKSPACE_ICONS: Record<string, LucideIcon> = {
  home:Globe2, queue:Building2, field:Route, reports:ChartNoAxesCombined, settings:Settings2,
  contracts:ClipboardList, grants:BadgeDollarSign, pulseiq:Gauge, knowledge:HeartPulse,
  '3d_studio':Boxes, claims:Database, gateway:BookOpen, data_health:ShieldCheck,
  resilience:ArchiveRestore, states_directory:ListFilter, geo:ListFilter,
  google_maps:MapPinned, map:RadioTower, gis:RadioTower, tm_dashboard:ChartNoAxesCombined,
  followups:CalendarCheck,
};
export function WorkspaceIcon({name, badge=false, className=''}:{name:string;badge?:boolean;className?:string}) {
  const Icon=WORKSPACE_ICONS[name] || Building2;
  const icon=<Icon className={`workspace-icon ${className}`} strokeWidth={1.8} aria-hidden="true"/>;
  return badge ? <span className="workspace-icon-badge" data-workspace-icon={name}>{icon}</span> : icon;
}
export function WorkspaceHeading({name,title,description,children}:{name:string;title:string;description:string;children?:React.ReactNode}) {
 return <header className="workspace-page-heading"><WorkspaceIcon name={name} badge/><div><p className="workspace-eyebrow">EMS & Fire · Territory intelligence</p><h1>{title}</h1><p>{description}</p></div>{children}</header>;
}
