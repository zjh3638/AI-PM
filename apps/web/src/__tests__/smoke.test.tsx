import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

function Hello({ name }: { name: string }) {
  return <h1>Hello, {name}!</h1>;
}

describe('Smoke test', () => {
  it('renders component', () => {
    render(<Hello name="World" />);
    expect(screen.getByText('Hello, World!')).toBeInTheDocument();
  });

  it('runs basic assertions', () => {
    expect(1 + 1).toBe(2);
  });
});
