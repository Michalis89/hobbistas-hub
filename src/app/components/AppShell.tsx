import React from 'react';
import NavbarWrapper from './NavbarWrapper';
import { Footer } from './layout/Footer';
import AppRuntimeEnhancements from './shared/AppRuntimeEnhancements';
import DemoBanner from './shared/DemoBanner.client';
import { TicketNotificationProvider } from '@/context/TicketNotificationContext';

type Props = {
  children: React.ReactNode;
};

export default function AppShell({ children }: Props) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <AppRuntimeEnhancements />

      {/* Ambient gradient - fixed to viewport so it doesn't scale with page height */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 4% -12%, hsl(var(--accent-primary) / 0.08), transparent 48%), radial-gradient(circle at 88% -10%, hsl(var(--accent-primary) / 0.06), transparent 44%)',
        }}
      />

      {/* Content wrapper with flex layout for sticky footer */}
      <TicketNotificationProvider>
        <div className="relative flex min-h-screen flex-col">
          <NavbarWrapper />
          <DemoBanner />
          <main
            id="main-content"
            className="app-main-shell flex-1"
            style={{ scrollPaddingBlockStart: '6rem' }}
          >
            {children}
          </main>
          <Footer />
        </div>
      </TicketNotificationProvider>
    </div>
  );
}
