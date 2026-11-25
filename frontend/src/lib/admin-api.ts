import type { Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'maintainer' | 'user';

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: AppRole | null;
  mustChangePassword: boolean;
  familyIds: string[];
};

export type AdminFamily = {
  id: string;
  name: string;
};

export type AdminData = {
  users: AdminUser[];
  families: AdminFamily[];
};

export type AdminAction =
  | {
      action: 'invite';
      email: string;
      role: AppRole;
      familyIds: string[];
    }
  | {
      action: 'set_role';
      userId: string;
      role: AppRole;
    }
  | {
      action: 'set_family';
      userId: string;
      familyId: string;
      assigned: boolean;
    }
  | {
      action: 'delete_user';
      userId: string;
    }
  | {
      action: 'set_initial_password';
      password: string;
    };

const apiBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');

export async function adminApi<T>(
  session: Session,
  action?: AdminAction,
): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error('Die Admin-API ist nicht konfiguriert.');
  }

  const response = await fetch(`${apiBaseUrl}/api/admin/users`, {
    method: action ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(action ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(action ? { body: JSON.stringify(action) } : {}),
  });

  let payload: { error?: unknown };
  try {
    payload = (await response.json()) as { error?: unknown };
  } catch {
    throw new Error('Die Admin-API hat eine ungültige Antwort geliefert.');
  }

  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : 'Die Admin-Anfrage ist fehlgeschlagen.',
    );
  }

  return payload as T;
}
