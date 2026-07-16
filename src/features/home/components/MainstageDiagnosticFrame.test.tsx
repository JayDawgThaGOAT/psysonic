import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MainstageDiagnosticFrame from '@/features/home/components/MainstageDiagnosticFrame';
import {
  createMainstageDiagnosticSections,
  useMainstageDiagnosticStore,
} from '@/features/home/store/mainstageDiagnosticStore';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

describe('MainstageDiagnosticFrame', () => {
  beforeEach(() => {
    useMainstageDiagnosticStore.setState({ sections: createMainstageDiagnosticSections() });
  });

  it('shows controls, enabled content, and generation information', () => {
    useMainstageDiagnosticStore.getState().finish('recent', {
      status: 'ready',
      durationMs: 37,
      itemCount: 4,
      detail: 'warm cache',
    });

    renderWithProviders(
      <MainstageDiagnosticFrame sectionId="recent" label="Recently Added">
        <div>Recent albums</div>
      </MainstageDiagnosticFrame>,
    );

    expect(screen.getByRole('checkbox', { name: 'Enable Recently Added' })).toBeChecked();
    expect(screen.getByText('Recent albums')).toBeInTheDocument();
    expect(screen.getAllByText('Ready')).toHaveLength(2);
    expect(screen.getByText('37 ms')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('warm cache')).toBeInTheDocument();
  });

  it('keeps controls and disabled diagnostics visible while hiding children', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MainstageDiagnosticFrame sectionId="hero" label="Featured">
        <div>Hero content</div>
      </MainstageDiagnosticFrame>,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Enable Featured' });
    await user.click(checkbox);

    expect(checkbox).not.toBeChecked();
    expect(screen.queryByText('Hero content')).not.toBeInTheDocument();
    expect(screen.getAllByText('Disabled')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Featured' })).toBeInTheDocument();
  });

  it('copies the section diagnostic summary when generation information is clicked', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    useMainstageDiagnosticStore.getState().finish('recent', {
      status: 'ready', durationMs: 42, itemCount: 3, detail: 'cache',
    });

    renderWithProviders(
      <MainstageDiagnosticFrame sectionId="recent" label="Recently Added">
        <div>Recent albums</div>
      </MainstageDiagnosticFrame>,
    );
    await user.click(screen.getByRole('button', { name: 'Generation information' }));

    expect(writeText).toHaveBeenCalledWith([
      'mainstage section: recent (Recently Added)',
      'status: ready (Ready)',
      'durationMs: 42',
      'itemCount: 3',
      'enabled: true',
      'detail: cache',
    ].join('\n'));
  });
});
