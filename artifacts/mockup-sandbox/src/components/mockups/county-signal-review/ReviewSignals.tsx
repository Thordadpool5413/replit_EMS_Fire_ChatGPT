import './_group.css';

type County = {
  countyFips: string;
  countyName: string;
  countySeat: string;
  area: string;
  places: number;
  population: string;
  averageTransport: string;
  ohca: string;
  nri: string;
  rating: 'Very Low' | 'Relatively Moderate';
};

const counties: County[] = [
  {
    countyFips: '12001',
    countyName: 'Alachua County',
    countySeat: 'Gainesville',
    area: '875 sq mi',
    places: 8,
    population: '184,943',
    averageTransport: '18.3',
    ohca: '318',
    nri: '90.33',
    rating: 'Relatively Moderate',
  },
  {
    countyFips: '12003',
    countyName: 'Baker County',
    countySeat: 'Macclenny',
    area: '585.2 sq mi',
    places: 5,
    population: '48,185',
    averageTransport: '26.5',
    ohca: '83',
    nri: '13.26',
    rating: 'Very Low',
  },
  {
    countyFips: '12005',
    countyName: 'Bay County',
    countySeat: 'Panama City',
    area: '758.5 sq mi',
    places: 8,
    population: '161,554',
    averageTransport: '27.4',
    ohca: '278',
    nri: '94.12',
    rating: 'Relatively Moderate',
  },
];

const ratingColors: Record<County['rating'], string> = {
  'Very Low': '#34D399',
  'Relatively Moderate': '#FACC15',
};

export function ReviewSignals() {
  return (
    <main className="county-review signal-review">
      <style>{`
        .signal-review {
          padding: 18px 20px 20px;
          background: var(--pi-canvas-bg);
          color: var(--pi-text-primary);
          font-family: var(--font-sans);
        }
        .signal-review .review-topline {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 7px;
          color: var(--pi-action-ink);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .13em;
          text-transform: uppercase;
        }
        .signal-review .review-topline::before {
          width: 16px;
          height: 2px;
          background: var(--pi-action);
          content: "";
        }
        .signal-review .review-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--pi-border);
        }
        .signal-review .review-heading h1 {
          margin: 0;
          color: var(--pi-text-primary);
          font-family: var(--font-display);
          font-size: 25px;
          font-weight: 750;
          letter-spacing: -.045em;
          line-height: 1.1;
        }
        .signal-review .review-heading p {
          max-width: 590px;
          margin: 6px 0 0;
          color: var(--pi-text-secondary);
          font-size: 12px;
          line-height: 1.45;
        }
        .signal-review .review-total {
          flex: 0 0 auto;
          padding: 5px 8px;
          border: 1px solid var(--pi-border);
          border-radius: 6px;
          background: var(--pi-surface-bg);
          color: var(--pi-text-secondary);
          font-size: 10px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .signal-review .scope-note {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          margin: 12px 0 13px;
          padding: 9px 11px;
          border: 1px solid var(--pi-border);
          border-radius: 7px;
          background: var(--pi-action-subtle);
          color: var(--pi-text-secondary);
          font-size: 11px;
          line-height: 1.45;
        }
        .signal-review .scope-mark {
          display: grid;
          width: 16px;
          height: 16px;
          flex: 0 0 16px;
          place-items: center;
          border: 1px solid var(--pi-border-strong);
          border-radius: 50%;
          color: var(--pi-action-ink);
          font-size: 10px;
          font-weight: 800;
        }
        .signal-review .column-head,
        .signal-review .county-row {
          display: grid;
          grid-template-columns: minmax(155px, 1.42fr) minmax(150px, 1.13fr) minmax(195px, 1.45fr) minmax(122px, .92fr);
          column-gap: 13px;
        }
        .signal-review .column-head {
          align-items: end;
          padding: 0 12px 6px;
          color: var(--pi-text-muted);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .signal-review .county-list {
          display: grid;
          gap: 8px;
        }
        .signal-review .county-row {
          min-height: 134px;
          align-items: center;
          padding: 10px 12px;
          border: 1px solid var(--pi-border);
          border-radius: 8px;
          background: var(--pi-surface-bg);
          box-shadow: var(--shadow-card);
        }
        .signal-review .county-identity {
          align-self: stretch;
          display: flex;
          min-width: 0;
          flex-direction: column;
          justify-content: center;
          border-right: 1px solid var(--pi-border);
        }
        .signal-review .county-code {
          color: var(--pi-text-muted);
          font: 700 10px/1.2 var(--font-mono);
          letter-spacing: .035em;
        }
        .signal-review .county-identity h2 {
          margin: 5px 0 5px;
          color: var(--pi-text-primary);
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 750;
          letter-spacing: -.035em;
          line-height: 1.1;
        }
        .signal-review .county-locale {
          color: var(--pi-text-secondary);
          font-size: 10px;
          line-height: 1.5;
        }
        .signal-review .place-chip {
          width: fit-content;
          margin-top: 7px;
          padding: 3px 6px;
          border-radius: 4px;
          background: var(--pi-action-subtle);
          color: var(--pi-action-ink);
          font-size: 10px;
          font-weight: 700;
        }
        .signal-review .nri-block {
          min-width: 0;
        }
        .signal-review .source-label {
          margin-bottom: 5px;
          color: var(--pi-text-muted);
          font-size: 10px;
          font-weight: 750;
          letter-spacing: .09em;
          text-transform: uppercase;
        }
        .signal-review .nri-rating {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--pi-text-primary);
          font-size: 11px;
          font-weight: 750;
          line-height: 1.2;
        }
        .signal-review .rating-dot {
          width: 8px;
          height: 8px;
          flex: 0 0 8px;
          border: 1px solid var(--pi-border-strong);
          border-radius: 50%;
        }
        .signal-review .nri-score {
          margin-top: 5px;
          color: var(--pi-text-secondary);
          font: 700 14px/1.1 var(--font-mono);
          font-variant-numeric: tabular-nums;
        }
        .signal-review .vintage {
          margin-top: 6px;
          color: var(--pi-text-muted);
          font-size: 10px;
        }
        .signal-review .reference-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          border: 1px solid var(--pi-border);
          border-radius: 6px;
          background: var(--pi-surface-subtle);
        }
        .signal-review .reference-cell {
          min-width: 0;
          padding: 8px 6px 7px;
        }
        .signal-review .reference-cell + .reference-cell {
          border-left: 1px solid var(--pi-border);
        }
        .signal-review .reference-label {
          min-height: 22px;
          color: var(--pi-text-secondary);
          font-size: 10px;
          font-weight: 600;
          line-height: 1.25;
        }
        .signal-review .reference-value {
          margin-top: 3px;
          color: var(--pi-text-primary);
          font: 750 14px/1.1 var(--font-mono);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .signal-review .reference-value small {
          font-family: var(--font-sans);
          font-size: 10px;
          font-weight: 650;
        }
        .signal-review .review-state {
          display: flex;
          min-width: 0;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
        }
        .signal-review .pending-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 6px;
          border: 1px solid var(--pi-estimated-border);
          border-radius: 4px;
          background: var(--pi-estimated-bg);
          color: var(--pi-estimated-text);
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
        }
        .signal-review .pending-badge::before {
          width: 5px;
          height: 5px;
          border: 1px solid var(--pi-estimated-text);
          border-radius: 50%;
          content: "";
        }
        .signal-review .metadata-copy {
          color: var(--pi-text-muted);
          font-size: 10px;
          line-height: 1.35;
        }
        .signal-review .review-action {
          display: inline-flex;
          min-height: 24px;
          align-items: center;
          gap: 5px;
          padding: 4px 7px;
          border: 1px solid color-mix(in srgb, var(--pi-action) 28%, var(--pi-border));
          border-radius: 4px;
          background: var(--pi-surface-bg);
          color: var(--pi-action-ink);
          font-size: 10px;
          font-weight: 750;
          white-space: nowrap;
        }
        .signal-review .review-action span {
          font-size: 12px;
          line-height: 8px;
        }
        .signal-review .footnote {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-top: 11px;
          padding-top: 8px;
          border-top: 1px solid var(--pi-border);
          color: var(--pi-text-muted);
          font-size: 10px;
          line-height: 1.4;
        }
        .signal-review .footnote strong {
          color: var(--pi-text-secondary);
          font-weight: 700;
        }
        @media (max-width: 740px) {
          .signal-review { padding: 14px; }
          .signal-review .review-heading { align-items: flex-start; }
          .signal-review .review-heading h1 { font-size: 22px; }
          .signal-review .column-head { display: none; }
          .signal-review .county-row {
            grid-template-columns: minmax(120px, 1fr) minmax(130px, 1fr);
            row-gap: 12px;
            padding: 12px;
          }
          .signal-review .county-identity { border-right: 0; }
          .signal-review .reference-grid { grid-column: 1 / -1; }
          .signal-review .review-state { align-items: flex-end; text-align: right; }
          .signal-review .footnote { flex-direction: column; }
        }
        @media (max-width: 420px) {
          .signal-review .review-total { display: none; }
          .signal-review .county-row { grid-template-columns: 1fr 1fr; column-gap: 8px; }
          .signal-review .reference-cell { padding-inline: 4px; }
          .signal-review .reference-label { font-size: 10px; }
          .signal-review .reference-value { font-size: 13px; }
        }
      `}</style>

      <header className="review-heading">
        <div>
          <div className="review-topline">Territory intelligence / County review</div>
          <h1>County signals</h1>
          <p>Current county reference figures alongside FEMA NRI risk context and end-user review status.</p>
        </div>
        <span className="review-total">3 counties in view</span>
      </header>

      <aside className="scope-note">
        <span className="scope-mark" aria-hidden="true">i</span>
        <span><strong>County context is not an agency operational rating.</strong> Reference measures remain visible for review; their source, scope, vintage, and reporting period are not recorded in the current county data.</span>
      </aside>

      <div className="column-head" aria-hidden="true">
        <span>County / geography</span>
        <span>FEMA NRI · source-defined</span>
        <span>County reference context</span>
        <span>End-user review</span>
      </div>

      <section className="county-list" aria-label="County signal comparison">
        {counties.map((county) => (
          <article className="county-row" key={county.countyFips} aria-labelledby={`review-${county.countyFips}`}>
            <div className="county-identity">
              <span className="county-code">FL · {county.countyFips}</span>
              <h2 id={`review-${county.countyFips}`}>{county.countyName}</h2>
              <div className="county-locale">Seat <strong>{county.countySeat}</strong> · {county.area}</div>
              <span className="place-chip">{county.places} mapped places</span>
            </div>

            <div className="nri-block">
              <div className="source-label">FEMA NRI rating</div>
              <div className="nri-rating">
                <span className="rating-dot" style={{ backgroundColor: ratingColors[county.rating] }} />
                {county.rating}
              </div>
              <div className="nri-score">{county.nri}</div>
          <div className="vintage">Source vintage · December 2025</div>
            </div>

            <div className="reference-grid" aria-label={`Current county reference figures for ${county.countyName}`}>
              <div className="reference-cell">
                <div className="reference-label">Population reference</div>
                <div className="reference-value">{county.population}</div>
              </div>
              <div className="reference-cell">
                <div className="reference-label">Average transport</div>
                <div className="reference-value">{county.averageTransport}<small> min</small></div>
              </div>
              <div className="reference-cell">
                <div className="reference-label">Annual OHCA reference</div>
                <div className="reference-value">{county.ohca}</div>
              </div>
            </div>

            <div className="review-state">
                <span className="pending-badge">Awaiting your review</span>
              <span className="metadata-copy">Reference metadata unavailable: source, vintage, scope &amp; period</span>
              <button type="button" className="review-action" aria-label={`Confirm or correct ${county.countyName} figures`}>
                Confirm / correct <span aria-hidden="true">›</span>
              </button>
            </div>
          </article>
        ))}
      </section>

      <footer className="footnote">
        <span><strong>Review status describes the user’s review only.</strong> It does not assert whether a reference figure is true or false.</span>
        <span>Population · transport · OHCA are neutral descriptive context</span>
      </footer>
    </main>
  );
}
