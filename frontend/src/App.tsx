import './App.css';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { Tables } from './lib/database.types';

type Family = Pick<Tables<'families'>, 'id' | 'name'>;

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [family, setFamily] = useState<Family | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !session) {
      setFamily(null);
      return;
    }

    const loadFamily = async () => {
      setLoading(true);
      const { data: memberships, error: membershipError } = await client
        .from('family_memberships')
        .select('family_id, families(id, name)')
        .eq('user_id', session.user.id)
        .limit(1);

      if (membershipError) {
        setError(membershipError.message);
      } else {
        const membership = memberships?.[0];
        const relation = membership?.families;
        setFamily(
          Array.isArray(relation) ? (relation[0] ?? null) : (relation ?? null),
        );
      }
      setLoading(false);
    };

    loadFamily();
  }, [session]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) setError(signInError.message);
    setLoading(false);
  };

  const signUp = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setError('');
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName.trim() || undefined },
      },
    });
    if (signUpError) setError(signUpError.message);
    setLoading(false);
  };

  const signOut = async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    setLoading(false);
  };

  const createFamily = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setError('');
    const { data, error: familyError } = await supabase.rpc('create_family', {
      family_name: familyName,
    });

    if (familyError) {
      setError(familyError.message);
    } else if (typeof data === 'string') {
      setFamily({ id: data, name: familyName.trim() });
      setFamilyName('');
    }
    setLoading(false);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Familienkorb Startseite">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>Familienkorb</span>
        </a>
        {session ? (
          <button className="sign-out-button" type="button" onClick={signOut}>
            Abmelden
          </button>
        ) : (
          <span className="connection-status">
            <span aria-hidden="true" />
            Gemeinsam einkaufen
          </span>
        )}
      </header>

      {!isSupabaseConfigured ? (
        <section className="welcome-card" aria-labelledby="welcome-title">
          <span className="eyebrow">EINKAUFEN, LEICHT GEMACHT</span>
          <h1 id="welcome-title">Supabase-Konfiguration fehlt.</h1>
          <p>
            Hinterlege VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY, um
            Anmeldung und Familien-Onboarding zu verwenden.
          </p>
        </section>
      ) : loading ? (
        <section className="welcome-card">
          <p role="status">Wird geladen...</p>
        </section>
      ) : !session ? (
        <section className="auth-card" aria-labelledby="auth-title">
          <span className="eyebrow">FAMILIENKONTO</span>
          <h1 id="auth-title">Anmelden oder registrieren</h1>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <form className="auth-form" onSubmit={signIn}>
            <label>
              E-Mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Passwort
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                minLength={6}
                required
              />
            </label>
            <button type="submit">Anmelden</button>
            <button
              className="secondary-button"
              type="button"
              onClick={signUp}
              disabled={loading}
            >
              Registrieren
            </button>
            <label>
              Anzeigename
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
              />
            </label>
          </form>
        </section>
      ) : !family ? (
        <section className="auth-card" aria-labelledby="family-title">
          <span className="eyebrow">ONBOARDING</span>
          <h1 id="family-title">Erste Familie anlegen</h1>
          <p>
            Die angemeldete Person wird als Administrator der Familie
            gespeichert.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <form className="auth-form" onSubmit={createFamily}>
            <label>
              Familienname
              <input
                value={familyName}
                onChange={(event) => setFamilyName(event.target.value)}
                minLength={1}
                maxLength={80}
                required
              />
            </label>
            <button type="submit">Familie erstellen</button>
          </form>
        </section>
      ) : (
        <section className="welcome-card" aria-labelledby="welcome-title">
          <span className="eyebrow">EINKAUFEN, LEICHT GEMACHT</span>
          <h1 id="welcome-title">Alles für den nächsten Einkauf.</h1>
          <p>
            Deine Familie <strong>{family.name}</strong> ist eingerichtet.
            Gemeinsame Einkaufslisten folgen im nächsten Sprint.
          </p>
          <div className="list-preview" aria-label="Vorschau der Einkaufsliste">
            <span className="list-icon" aria-hidden="true">
              ✓
            </span>
            <span>
              <strong>{family.name}</strong>
              <small>Eine Liste, alle auf dem gleichen Stand.</small>
            </span>
          </div>
        </section>
      )}
      <footer>Für den Alltag gemacht – gemeinsam mit der Familie.</footer>
    </main>
  );
}

export default App;
