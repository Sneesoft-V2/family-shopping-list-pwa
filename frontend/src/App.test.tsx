import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the German family shopping-list welcome screen', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Alles für den nächsten Einkauf.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Familien-Einkauf')).toBeInTheDocument();
  });
});
