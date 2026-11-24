import './App.css';

function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Familienkorb Startseite">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>Familienkorb</span>
        </a>
        <span className="connection-status">
          <span aria-hidden="true" />
          Gemeinsam einkaufen
        </span>
      </header>

      <section className="welcome-card" aria-labelledby="welcome-title">
        <span className="eyebrow">EINKAUFEN, LEICHT GEMACHT</span>
        <h1 id="welcome-title">Alles für den nächsten Einkauf.</h1>
        <p>
          Eure gemeinsame Einkaufsliste wird hier zum Leben erweckt. Bald könnt
          ihr Artikel ergänzen und mit der Familie teilen.
        </p>
        <div className="list-preview" aria-label="Vorschau der Einkaufsliste">
          <span className="list-icon" aria-hidden="true">
            ✓
          </span>
          <span>
            <strong>Familien-Einkauf</strong>
            <small>Eine Liste, alle auf dem gleichen Stand.</small>
          </span>
        </div>
      </section>
      <footer>Für den Alltag gemacht – gemeinsam mit der Familie.</footer>
    </main>
  );
}

export default App;
