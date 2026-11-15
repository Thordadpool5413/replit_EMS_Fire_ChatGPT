/** Bounded discovery pagination. Never claim nationwide completeness. */
export async function collectNppesPages<T extends { number?: string; enumeration_type?: string }>(
  fetchPage: (skip:number,limit:number)=>Promise<{results?:T[];result_count?:number;Errors?:unknown;errors?:unknown}>,
) {
  const records=new Map<string,T>();let received=0;let warning:string|null=null;
  for(let skip=0;skip<=1000;skip+=200){
    try {
      const payload=await fetchPage(skip,200);
      if(payload.Errors||payload.errors||(!Array.isArray(payload.results)&&payload.result_count!==0))throw new Error('Invalid NPPES page');
      const page=payload.results??[];received+=page.length;const before=records.size;
      for(const row of page)if(row.enumeration_type==='NPI-2'&&/^\d{10}$/.test(row.number??''))records.set(String(row.number),{...row,number:String(row.number)});
      if(page.length<200)return {records:[...records.values()],totalResults:received,resultsTruncated:false,warning};
      if(records.size===before){warning='The source repeated a page or returned no usable identifiers. Results are incomplete.';break;}
    }catch(error){if(skip===0)throw error;warning='A later source page failed. Earlier results are retained; retry or narrow your search.';break;}
  }
  return {records:[...records.values()],totalResults:received,resultsTruncated:true,warning:warning??'The discovery limit was reached. Narrow the agency name or city; these results may be incomplete.'};
}
