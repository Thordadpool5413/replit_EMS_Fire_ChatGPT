import React, { useEffect, useState } from 'react';
import { Banknote } from 'lucide-react';

type Annual = Record<string, [number, number, number?]>;
const source = 'https://opendata.hhs.gov/datasets/medicaid-provider-spending';
export function MedicaidAmbulanceTotals({ npi, area }: { npi?: string; area?: string }) {
  const key = npi || area;
  const file = npi ? npi.slice(0, 2) : 'areas';
  const [data, setData] = useState<{ key: string; rows?: Annual; failed?: boolean }>();
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch((import.meta.env?.BASE_URL ?? '/') + 'data/medicaid/' + file + '.json', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error();
        const records = await response.json();
        if (!controller.signal.aborted) setData({ key, rows: records[key] });
      }).catch(() => { if (!controller.signal.aborted) setData({ key, failed: true }); });
    return () => controller.abort();
  }, [key, file]);
  if (!key) return null;
  const current = data?.key === key ? data : undefined;
  const change = (year: string, index: 0 | 1) => {
    const previous = current?.rows?.[String(Number(year) - 1)]?.[index];
    if (!previous || previous < 0 || !current?.rows) return '—';
    return ((current.rows[year][index] - previous) / previous).toLocaleString('en-US', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  };
  return <section className="pr-panel">
    <h3 className="pr-icon-heading"><Banknote size={18} aria-hidden="true" /> Medicaid ambulance payments</h3>
    <p className="pr-muted">{npi ? 'Billing NPI ' + npi : 'Matched billing organizations by registry location'} · Transport and mileage · 2018–2024</p>
    {!current ? <p role="status">Loading payment history…</p> : current.failed ? <p role="alert">Payment history could not be loaded.</p> :
      current.rows ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Year</th><th>Claim lines</th><th>Reported paid</th>{npi && <><th>Annual line change</th><th>Annual payment change</th></>}{area && <th>Billing NPIs</th>}</tr></thead>
        <tbody>{Object.entries(current.rows).reverse().map(([year, [lines, cents, providers]]) => <tr key={year}><th>{year}</th>
          <td>{lines.toLocaleString()}</td><td>{(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
          {npi && <><td>{change(year, 0)}</td><td>{change(year, 1)}</td></>}{area && <td>{providers?.toLocaleString()}</td>}</tr>)}</tbody></table></div> : <p>No published rows matched this selection.</p>}
    <p className="text-xs">HHS suppresses small cells. Claim lines can include mileage on the same trip. Figures cover published Medicaid and CHIP records. <a className="underline" href={source} target="_blank" rel="noreferrer">HHS source and methodology</a></p>
  </section>;
}
