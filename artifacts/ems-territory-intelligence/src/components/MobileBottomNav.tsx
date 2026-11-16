import {WorkspaceIcon} from './design/WorkspaceIcon';
import React from 'react';
import { PRIMARY_WORKSPACES, primaryWorkspaceFor } from '../navigation/workspaceNavigation';
interface MobileBottomNavProps { activeTab:string; setActiveTab:(tab:string)=>void; onGoHome?:()=>void; dayRouteCount:number }
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({activeTab,setActiveTab,onGoHome,dayRouteCount}) => {
  const current = primaryWorkspaceFor(activeTab);
  const items = [...PRIMARY_WORKSPACES,{id:'settings',label:'Settings',description:'Manage data, backups, and preferences.'}];
  return <nav className="pi-mobile-nav fixed bottom-0 left-0 right-0 z-50 md:hidden" aria-label="Primary navigation">
    <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
      {items.map(item => {
        return <button key={item.id} type="button" className={`pi-mobile-nav__item min-h-[52px] min-w-[44px] flex flex-col items-center justify-center relative ${current===item.id?'is-active':''}`} aria-label={item.label} aria-current={current===item.id?'page':undefined} onClick={()=>item.id==='home'&&onGoHome?onGoHome():setActiveTab(item.id)}>
          <WorkspaceIcon name={item.id}/><span className="text-[10.5px] leading-none mt-1">{item.label}</span>
          {item.id==='field'&&dayRouteCount>0&&<span className="absolute top-0 right-1 text-[10px] font-semibold" aria-label={`${dayRouteCount} agencies in today's route`}>{dayRouteCount}</span>}
        </button>;
      })}
    </div>
  </nav>;
};
