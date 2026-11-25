import './App.css';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { adminApi } from './lib/admin-api';
import type { AdminData, AdminUser, AppRole } from './lib/admin-api';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { Tables } from './lib/database.types';

type Family = Pick<Tables<'families'>, 'id' | 'name'>;
type RoleStatus = Pick<Tables<'user_roles'>, 'role' | 'must_change_password'>;

const roles: { value: AppRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'maintainer', label: 'Maintainer' },
  { value: 'user', label: 'User' },
];

function isAppRole(value: string): value is AppRole {
  return roles.some((role) => role.value === value);
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('user');
  const [inviteFamilyId, setInviteFamilyId] = useState('');
  const [roleStatus, setRoleStatus] = useState<RoleStatus | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [adminData, setAdminData] = useState<AdminData | null>(null);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (
        event !== 'INITIAL_SESSION' &&
        event !== 'SIGNED_IN' &&
        event !== 'SIGNED_OUT'
      ) {
        return;
      }
      setRoleStatus(null);
      setFamilies([]);
      setAdminData(null);
      setAccessLoaded(false);
      setError('');
      setLoading(Boolean(nextSession));
    });

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) setError(sessionError.message);
        setSession(data.session);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Die Sitzung konnte nicht geladen werden.',
        );
        setLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !session) return;

    let active = true;
    const loadAccess = async () => {
      try {
        const { data: role, error: roleError } = await client
          .from('user_roles')
          .select('role, must_change_password')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (roleError) throw new Error(roleError.message);
        if (!active) return;

        setRoleStatus(role);
        if (!role || role.must_change_password) {
          setFamilies([]);
          setAdminData(null);
          setAccessLoaded(true);
          return;
        }

        if (role.role === 'admin') {
          const data = await adminApi<AdminData>(session);
          if (!active) return;
          setAdminData(data);
          setFamilies([]);
        } else {
          const { data: memberships, error: membershipError } = await client
            .from('family_memberships')
            .select('family_id, families(id, name)')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: true });
          if (membershipError) throw new Error(membershipError.message);
          if (!active) return;
          const assignedFamilies: Family[] = [];
          for (const membership of memberships ?? []) {
            const relation = membership.families;
            if (Array.isArray(relation)) assignedFamilies.push(...relation);
            else if (relation) assignedFamilies.push(relation);
          }
          setFamilies(assignedFamilies);
          setAdminData(null);
        }

        if (active) setAccessLoaded(true);
      } catch (cause) {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Die Berechtigung konnte nicht geladen werden.',
        );
        setAccessLoaded(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadAccess();

    return () => {
      active = false;
    };
  }, [session]);

  const refreshAdminData = useCallback(async (currentSession: Session) => {
    const data = await adminApi<AdminData>(currentSession);
    setAdminData(data);
  }, []);

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
    if (!supabase || !session) return;

    setLoading(true);
    setError('');
    const { error: familyError } = await supabase.rpc('create_family', {
      family_name: familyName,
    });

    if (familyError) {
      setError(familyError.message);
    } else {
      setFamilyName('');
      try {
        await refreshAdminData(session);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Die Familienliste konnte nicht aktualisiert werden.',
        );
      }
    }
    setLoading(false);
  };

  const inviteUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      await adminApi(session, {
        action: 'invite',
        email: inviteEmail,
        role: inviteRole,
        familyIds: inviteFamilyId ? [inviteFamilyId] : [],
      });
      setInviteEmail('');
      setInviteFamilyId('');
      await refreshAdminData(session);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Einladung fehlgeschlagen.',
      );
    }
    setLoading(false);
  };

  const changeRole = async (user: AdminUser, role: AppRole) => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      await adminApi(session, { action: 'set_role', userId: user.id, role });
      await refreshAdminData(session);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Die Rolle konnte nicht geändert werden.',
      );
    }
    setLoading(false);
  };

  const toggleFamily = async (
    user: AdminUser,
    familyId: string,
    assigned: boolean,
  ) => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      await adminApi(session, {
        action: 'set_family',
        userId: user.id,
        familyId,
        assigned,
      });
      await refreshAdminData(session);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Die Familienzuordnung konnte nicht geändert werden.',
      );
    }
    setLoading(false);
  };

  const deleteUser = async (user: AdminUser) => {
    if (!session || !window.confirm(`Konto ${user.email} wirklich löschen?`)) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      await adminApi(session, { action: 'delete_user', userId: user.id });
      if (user.id === session.user.id) {
        await supabase?.auth.signOut();
      } else {
        await refreshAdminData(session);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Das Konto konnte nicht gelöscht werden.',
      );
    }
    setLoading(false);
  };

  const setInitialPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !session) return;
    if (newPassword !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await adminApi(session, {
        action: 'set_initial_password',
        password: newPassword,
      });
      setNewPassword('');
      setConfirmPassword('');
      const { data, error: roleError } = await supabase
        .from('user_roles')
        .select('role, must_change_password')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (roleError) throw new Error(roleError.message);
      setRoleStatus(data);
      if (data?.role === 'admin') {
        await refreshAdminData(session);
      } else if (data && !data.must_change_password) {
        const { data: memberships, error: membershipError } = await supabase
          .from('family_memberships')
          .select('family_id, families(id, name)')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true });
        if (membershipError) throw new Error(membershipError.message);
        const assignedFamilies: Family[] = [];
        for (const membership of memberships ?? []) {
          const relation = membership.families;
          if (Array.isArray(relation)) assignedFamilies.push(...relation);
          else if (relation) assignedFamilies.push(relation);
        }
        setFamilies(assignedFamilies);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Das Passwort konnte nicht gespeichert werden.',
      );
    }
    setLoading(false);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="Familienkorb Startseite"
        >
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
            Hinterlege VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY, um die
            Anmeldung zu verwenden.
          </p>
        </section>
      ) : loading ? (
        <section className="welcome-card">
          <p role="status">Wird geladen...</p>
        </section>
      ) : !session ? (
        <section className="auth-card" aria-labelledby="auth-title">
          <span className="eyebrow">FAMILIENKONTO</span>
          <h1 id="auth-title">Anmelden</h1>
          <p>Konten werden von einem Admin eingeladen.</p>
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
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              Anmelden
            </button>
          </form>
        </section>
      ) : !accessLoaded ? (
        <section className="welcome-card">
          <p role="status">Berechtigung wird geprüft...</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : roleStatus?.must_change_password ? (
        <section className="auth-card" aria-labelledby="password-title">
          <span className="eyebrow">KONTO EINRICHTEN</span>
          <h1 id="password-title">Eigenes Passwort festlegen</h1>
          <p>Lege ein neues Passwort fest, bevor du die App verwendest.</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <form className="auth-form" onSubmit={setInitialPassword}>
            <label>
              Neues Passwort
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <label>
              Passwort wiederholen
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              Passwort speichern
            </button>
          </form>
        </section>
      ) : !roleStatus ? (
        <section className="welcome-card">
          <h1>Kein App-Zugriff</h1>
          <p>Dieses Konto wurde nicht für die App freigeschaltet.</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : roleStatus.role === 'admin' ? (
        <section className="admin-card" aria-labelledby="admin-title">
          <span className="eyebrow">ADMINISTRATION</span>
          <h1 id="admin-title">Benutzer und Familien</h1>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="admin-grid">
            <form className="auth-form admin-form" onSubmit={inviteUser}>
              <h2>Benutzer einladen</h2>
              <label>
                E-Mail
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Rolle
                <select
                  value={inviteRole}
                  onChange={(event) => {
                    if (isAppRole(event.target.value)) {
                      setInviteRole(event.target.value);
                    }
                  }}
                >
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Familie (optional)
                <select
                  value={inviteFamilyId}
                  onChange={(event) => setInviteFamilyId(event.target.value)}
                >
                  <option value="">Noch keiner Familie zuordnen</option>
                  {adminData?.families.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={loading}>
                Einladung senden
              </button>
            </form>

            <form className="auth-form admin-form" onSubmit={createFamily}>
              <h2>Familie anlegen</h2>
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
              <button type="submit" disabled={loading}>
                Familie erstellen
              </button>
              <ul className="family-list">
                {adminData?.families.map((item) => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            </form>
          </div>

          <h2>Konten</h2>
          {adminData?.users.map((user) => (
            <article className="admin-user" key={user.id}>
              <div className="admin-user-heading">
                <div>
                  <strong>{user.displayName || user.email}</strong>
                  <small>{user.email}</small>
                  {user.mustChangePassword && (
                    <small className="pending-invite">
                      Passwortannahme offen
                    </small>
                  )}
                </div>
                <label>
                  Rolle
                  <select
                    aria-label={`Rolle für ${user.email}`}
                    value={user.role ?? 'user'}
                    disabled={loading || user.id === session.user.id}
                    onChange={(event) => {
                      if (isAppRole(event.target.value)) {
                        changeRole(user, event.target.value);
                      }
                    }}
                  >
                    {roles.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="danger-button"
                  type="button"
                  disabled={loading}
                  onClick={() => deleteUser(user)}
                >
                  Löschen
                </button>
              </div>
              <fieldset className="family-assignments">
                <legend>Familien</legend>
                {adminData?.families.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={user.familyIds.includes(item.id)}
                      disabled={loading}
                      onChange={(event) =>
                        toggleFamily(user, item.id, event.target.checked)
                      }
                    />
                    {item.name}
                  </label>
                ))}
                {adminData?.families.length === 0 && (
                  <small>Noch keine Familien angelegt.</small>
                )}
              </fieldset>
            </article>
          ))}
          {adminData && adminData.users.length === 0 && (
            <p>Noch keine Benutzer vorhanden.</p>
          )}
          {!adminData && error && (
            <p role="status">Die Benutzerliste ist derzeit nicht verfügbar.</p>
          )}
        </section>
      ) : families.length === 0 ? (
        <section className="welcome-card">
          <span className="eyebrow">FAMILIENKONTO</span>
          <h1>Noch keiner Familie zugeordnet</h1>
          <p>Ein Admin muss dein Konto einer Familie zuweisen.</p>
        </section>
      ) : (
        <section className="welcome-card" aria-labelledby="welcome-title">
          <span className="eyebrow">EINKAUFEN, LEICHT GEMACHT</span>
          <h1 id="welcome-title">Alles für den nächsten Einkauf.</h1>
          <p>
            Deine Familien sind eingerichtet. Gemeinsame Einkaufslisten folgen
            im nächsten Sprint.
          </p>
          {families.map((item) => (
            <div
              className="list-preview"
              aria-label={`Vorschau der Familie ${item.name}`}
              key={item.id}
            >
              <span className="list-icon" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>{item.name}</strong>
                <small>Eine Liste, alle auf dem gleichen Stand.</small>
              </span>
            </div>
          ))}
        </section>
      )}
      <footer>Für den Alltag gemacht – gemeinsam mit der Familie.</footer>
    </main>
  );
}

export default App;
