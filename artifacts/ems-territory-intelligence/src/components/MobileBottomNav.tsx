import React from 'react';
import { Globe, Building2, Briefcase, BarChart3, Settings } from 'lucide-react';
import { PRIMARY_WORKSPACES, primaryWorkspaceFor } from '../navigation/workspaceNavigation';
interface MobileBottomNavProps { activeTab:string; setActiveTab:(tab:string)=>void; onGoHome?:()=>void; dayRouteCount:number }
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({activeTab,setActiveTab,onGoHome,dayRouteCount}) => {
  const current = primaryWorkspaceFor(activeTab);
  const items = [...PRIMARY_WORKSPACES,{id:'settings',label:'Settings',description:'Manage data, backups, and preferences.'}];
  const icons = {home:Globe,queue:Building2,field:Briefcase,reports:BarChart3,settings:Settings};
  return <nav className="pi-mobile-nav fixed bottom-0 left-0 right-0 z-50 md:hidden" aria-label="Primary navigation">
    <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
      {items.map(item => {
        const Icon=icons[item.id as keyof typeof icons];
        return <button key={item.id} type="button" className={`pi-mobile-nav__item min-h-[52px] min-w-[44px] flex flex-col items-center justify-center relative ${current===item.id?'is-active':''}`} aria-label={item.label} aria-current={current===item.id?'page':undefined} onClick={()=>item.id==='home'&&onGoHome?onGoHome():setActiveTab(item.id)}>
          <Icon className="h-5 w-5" aria-hidden="true"/><span className="text-[10.5px] leading-none mt-1">{item.label}</span>
          {item.id==='field'&&dayRouteCount>0&&<span className="absolute top-0 right-1 text-[10px] font-semibold" aria-label={`${dayRouteCount} agencies in today's route`}>{dayRouteCount}</span>}
        </button>;
      })}
    </div>
  </nav>;
};
