import {WorkspaceIcon} from './design/WorkspaceIcon';
import React, {useRef} from 'react';
import {Ellipsis} from 'lucide-react';
import {
  FIELD_WORKSPACE_TABS,
  OPPORTUNITIES_WORKSPACE_TABS,
  PRIMARY_WORKSPACES,
  SPECIALIST_WORKSPACE_TABS,
  SYSTEM_WORKSPACE_TABS,
  TERRITORY_WORKSPACE_TABS,
  primaryWorkspaceFor,
} from '../navigation/workspaceNavigation';
interface MobileBottomNavProps { activeTab:string; setActiveTab:(tab:string)=>void; onGoHome?:()=>void; dayRouteCount:number }
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({activeTab,setActiveTab,onGoHome,dayRouteCount}) => {
  const current = primaryWorkspaceFor(activeTab);
  const moreMenuRef = useRef<HTMLDetailsElement>(null);
  const moreSummaryRef = useRef<HTMLElement>(null);
  const groups = [
    {label:'Territory',items:TERRITORY_WORKSPACE_TABS},
    {label:'Field work',items:FIELD_WORKSPACE_TABS.filter(item=>item.id!=='field')},
    {label:'Opportunities',items:OPPORTUNITIES_WORKSPACE_TABS},
    {label:'Specialist tools',items:SPECIALIST_WORKSPACE_TABS},
    {label:'Data & system',items:[...SYSTEM_WORKSPACE_TABS,{id:'settings',label:'Settings'}]},
  ];
  const selectDestination = (tab:string) => {
    if (moreMenuRef.current) moreMenuRef.current.open = false;
    moreSummaryRef.current?.focus();
    setActiveTab(tab);
  };
  const handleMoreKeyDown = (event:React.KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key==='Escape' && moreMenuRef.current?.open) {
      event.preventDefault();
      moreMenuRef.current.open = false;
      moreSummaryRef.current?.focus();
    }
  };
  return <nav className="pi-mobile-nav fixed bottom-0 left-0 right-0 z-50 md:hidden" aria-label="Mobile primary workspaces">
    <div className="pi-mobile-nav__items pi-mobile-nav__grid">
      {PRIMARY_WORKSPACES.map(item => <button key={item.id} type="button" className={`pi-mobile-nav__item ${current===item.id?'is-active':''}`} aria-label={item.label} aria-current={current===item.id?'page':undefined} onClick={()=>item.id==='home'&&onGoHome?onGoHome():setActiveTab(item.id)}>
        <span className="pi-mobile-nav__icon"><WorkspaceIcon name={item.id}/>{item.id==='field'&&dayRouteCount>0&&<span className="pi-mobile-nav__badge" aria-label={`${dayRouteCount} agencies in today's route`}>{dayRouteCount>99?'99+':dayRouteCount}</span>}</span>
        <span className="pi-mobile-nav__label">{item.id==='field'?'Field':item.label}</span>
      </button>)}
      <details ref={moreMenuRef} className="pi-mobile-more" onKeyDown={handleMoreKeyDown}>
        <summary ref={moreSummaryRef} className="pi-mobile-nav__item pi-mobile-more__summary" aria-label="More destinations" aria-controls="pi-mobile-more-panel">
          <Ellipsis aria-hidden="true" size={21}/><span className="pi-mobile-nav__label">More</span>
        </summary>
        <div id="pi-mobile-more-panel" className="pi-mobile-more__panel" role="group" aria-label="More destinations">
          {groups.map(group=><section className="pi-mobile-more__group" key={group.label} aria-label={group.label}>
            <h2>{group.label}</h2>
            <div>
              {group.items.map(item=><button key={item.id} type="button" className="pi-mobile-more__link" aria-current={activeTab===item.id?'page':undefined} onClick={()=>selectDestination(item.id)}>
                <WorkspaceIcon name={item.id}/><span>{item.label}</span>
              </button>)}
            </div>
          </section>)}
        </div>
      </details>
    </div>
  </nav>;
};
