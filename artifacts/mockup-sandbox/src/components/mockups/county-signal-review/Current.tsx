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
  },
];

export function Current() {
  return (
    <main className="county-review">
      <header className="county-directory-heading">
        <div>
          <p className="eyebrow">County directory</p>
          <h1>Browse Florida counties</h1>
          <p className="subheading">
            County figures are reference context; review each source scope before
            applying them to a provider.
          </p>
        </div>
        <span className="county-count">60 shown · 67 total</span>
      </header>

      <section
        aria-label="Florida county cards"
        className="county-profile-grid"
      >
        {counties.map((county) => (
          <article
            key={county.countyFips}
            aria-labelledby={`current-county-${county.countyFips}`}
            className="county-profile-card"
          >
            <div className="county-profile-card-content">
              <div className="county-profile-card-heading">
                <div className="min-w-0">
                  <h2
                    id={`current-county-${county.countyFips}`}
                    className="county-profile-card-title"
                  >
                    {county.countyName}
                  </h2>
                  <div className="county-profile-card-meta">
                    County seat <strong>{county.countySeat}</strong>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">FIPS {county.countyFips}</span>
                    <span aria-hidden="true">·</span>
                    {county.area}
                  </div>
                </div>
                <span className="county-profile-place-count">
                  {county.places} mapped places
                </span>
              </div>

              <div
                className="county-profile-metrics"
                aria-label={`County reference figures for ${county.countyName}`}
              >
                <div className="county-profile-metric">
                  <span>Population reference</span>
                  <strong>{county.population}</strong>
                </div>
                <div className="county-profile-metric">
                  <span>Average transport</span>
                  <strong>
                    {county.averageTransport}
                    <small> min</small>
                  </strong>
                </div>
                <div className="county-profile-metric">
                  <span>Annual OHCA reference</span>
                  <strong>{county.ohca}</strong>
                </div>
              </div>

              <details className="county-profile-details">
                <summary className="county-profile-details-summary">
                  <span>Details &amp; sources</span>
                  <span className="count">{county.places} places · 5 figures</span>
                  <span aria-hidden="true">+</span>
                </summary>
              </details>
            </div>

            <footer className="county-profile-card-footer">
              <span className="county-profile-data-note">County reference only</span>
              <button type="button" className="county-profile-card-action">
                Inspect county <span aria-hidden="true">›</span>
              </button>
            </footer>
          </article>
        ))}
      </section>
    </main>
  );
}
