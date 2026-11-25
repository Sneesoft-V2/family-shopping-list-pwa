import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders a configuration warning when Supabase is not configured', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Supabase-Konfiguration fehlt.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument();
  });
});
