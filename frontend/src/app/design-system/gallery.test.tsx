import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DesignSystemGallery } from './gallery';

it('renders every gallery section in the light theme', () => {
  render(<DesignSystemGallery />);
  expect(screen.getByTestId('light-gallery')).toBeInTheDocument();
  for (const section of ['Buttons and feedback', 'Form fields', 'Dates', 'Status and people', 'Cards and progress', 'Navigation', 'Overlays and menus', 'Data table', 'Standalone states']) {
    expect(screen.getAllByRole('heading', { name: section })).toHaveLength(1);
  }
});
