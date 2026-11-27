import { useQuery } from '@tanstack/react-query';
import { loadCmsServiceEvidence } from './cmsAmbulanceEvidence';
import { loadProviderPurchases, providerProcurementSource } from './providerProcurement';
import { loadNerisDepartment, nerisAddressText, nerisObjectUrl, nerisCatalogDate } from './nerisStationCatalog';
import { commercialResearchStatus, COMMERCIAL_RESEARCH_LABELS } from './nationalCompetitiveResearch';
import type { DiscoveryFact } from './discoveryEvidence';

export function useDiscoverySources(npi?:string, key?:string, neris?:string) {
  const medicaid=useQuery({ queryKey:['discovery-medicaid',npi],enabled:!!npi,queryFn:async({signal})=>{
    const response=await fetch((import.meta.env?.BASE_URL ?? '/')+'data/medicaid/'+npi!.slice(0,2)+'.json',{signal});
    if(!response.ok) throw Error();
    const rows=(await response.json())[npi!] ?? {};
    return Object.entries(rows as Record<string,[number,number]>).map(([year,[lines,cents]])=>({
      topic:'Medicaid',detail:'Billing NPI '+npi+' · '+lines.toLocaleString()+' published transport and mileage claim lines · '+(cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'})+' paid. Small cells suppressed.',
      source:{date:year,label:'HHS Medicaid provider spending',url:'https://opendata.hhs.gov/datasets/medicaid-provider-spending'}}));
  }});
  const cms=useQuery({queryKey:['discovery-medicare',npi],enabled:!!npi,queryFn:async({signal})=>{
    const data=await loadCmsServiceEvidence(npi!,signal);
    return data.rows.map(r=>({topic:'Medicare',detail:[r.organizationName,'NPI '+r.npi,r.hcpcs,r.description,'Place of service '+r.placeOfService,r.services!=null && r.services+' service units',r.averageMedicarePayment!=null && '$'+r.averageMedicarePayment+' average Medicare payment'].filter(Boolean).join(' · '),source:{label:'CMS provider and service',date:String(data.reportingYear),url:data.queryUrl}}));
  }});
  const stations=useQuery({queryKey:['discovery-stations',neris],enabled:!!neris,queryFn:async()=>{
    const dept=await loadNerisDepartment(neris!);
    return (dept?.stations??[]).map(r=>({topic:'Stations',detail:[dept?.name,r.parentId,r.name,r.id,nerisAddressText(r.address),r.parentNameConflict && 'Parent name discrepancy'].filter(Boolean).join(' · '),source:{label:'NERIS station snapshot',date:nerisCatalogDate.slice(0,10),url:nerisObjectUrl(1,r.oid)}}));
  }});
  const purchases=useQuery({queryKey:['provider-purchases',key],enabled:!!providerProcurementSource(key),queryFn:({signal})=>loadProviderPurchases(key!,signal),staleTime:600000});
  const procurement=(purchases.data?.records??[]).map(r=>({topic:'Procurement',detail:[r.organization,r.title,COMMERCIAL_RESEARCH_LABELS[commercialResearchStatus(r)],r.vendor,r.amount!=null && '$'+r.amount,r.deadlineLocal && 'Bid deadline '+r.deadlineLocal].filter(Boolean).join(' · '),source:{label:r.source,date:r.publishedDay??'Unreported',url:r.sourceUrl}}));
  const facts:DiscoveryFact[]=[...medicaid.data??[],...cms.data??[],...stations.data??[],...procurement];
  return {facts,loading:[medicaid,cms,stations,purchases].some(q=>q.isFetching), unavailable:[medicaid.isError && 'Medicaid',cms.isError && 'Medicare',stations.isError && 'stations',purchases.isError && 'procurement'].filter(Boolean).join(', '),partial:!!purchases.data?.incomplete};
}
