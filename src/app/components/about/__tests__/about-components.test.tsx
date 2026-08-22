import { render, screen } from '@testing-library/react';
import { AboutFAQ } from '@/app/components/about/AboutFAQ';
import { AboutFinalCTA } from '@/app/components/about/AboutFinalCTA';
import { AboutHero } from '@/app/components/about/AboutHero';
import { AboutPeople } from '@/app/components/about/AboutPeople';
import { AboutPhilosophy } from '@/app/components/about/AboutPhilosophy';
import { AboutRoadmap } from '@/app/components/about/AboutRoadmap';
import { AboutTwoModes } from '@/app/components/about/AboutTwoModes';
import { AboutWhatYouGet } from '@/app/components/about/AboutWhatYouGet';
import type { TeamMember } from '@/app/components/about/AboutPeople';
import * as AboutIndex from '@/app/components/about';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@/app/components/shared/PageHero', () => ({
  __esModule: true,
  default: ({
    eyebrow,
    subtitle,
    actions,
    badges,
    title,
  }: {
    eyebrow: string;
    subtitle: string;
    actions: React.ReactNode;
    badges: React.ReactNode;
    title: React.ReactNode;
  }) => (
    <section data-testid="page-hero">
      <div>{eyebrow}</div>
      <div>{subtitle}</div>
      <div>{title}</div>
      <div>{actions}</div>
      <div>{badges}</div>
    </section>
  ),
}));

jest.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="accordion">{children}</div>
  ),
  AccordionItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="accordion-item">{children}</div>
  ),
  AccordionTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AccordionContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/avatar-image', () => ({
  AvatarImage: ({ alt }: { alt: string }) => <span data-testid="avatar-image" aria-label={alt} />,
}));

jest.mock('@/config/roadmap', () => ({
  ROADMAP_ITEMS: [
    {
      title: 'Item done',
      description: 'Done desc',
      status: 'done',
      area: 'core',
      icon: () => <svg data-testid="road-icon-done" />,
    },
    {
      title: 'Item in-progress',
      description: 'In progress desc',
      status: 'in-progress',
      area: 'core',
      icon: () => <svg data-testid="road-icon-progress" />,
    },
    {
      title: 'Item planned',
      description: 'Planned desc',
      status: 'planned',
      area: 'core',
      icon: () => <svg data-testid="road-icon-planned" />,
    },
  ],
  getStatusLabel: (status: string) => `status:${status}`,
}));

describe('about components', () => {
  it('AboutHero renders guest and authenticated CTA variants', () => {
    const { rerender } = render(<AboutHero />);

    expect(screen.getByTestId('page-hero')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start for free/i })).toHaveAttribute(
      'href',
      '/auth/register',
    );
    expect(screen.getByRole('link', { name: /browse the categories/i })).toHaveAttribute(
      'href',
      '/hobbies',
    );

    rerender(<AboutHero isAuthenticated />);
    expect(screen.getByRole('link', { name: /go to dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('AboutFinalCTA renders guest and authenticated CTA variants', () => {
    const { rerender } = render(<AboutFinalCTA />);
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute(
      'href',
      '/auth/register',
    );
    expect(screen.getByRole('link', { name: /contact us/i })).toHaveAttribute('href', '/support');

    rerender(<AboutFinalCTA isAuthenticated />);
    expect(screen.getByRole('link', { name: /go to dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('AboutFAQ renders all FAQ items', () => {
    render(<AboutFAQ />);
    expect(screen.getByText('Frequently asked questions')).toBeInTheDocument();
    expect(screen.getAllByTestId('accordion-item')).toHaveLength(10);
    expect(screen.getByText('Is Hobbistas free?')).toBeInTheDocument();
    expect(screen.getByText(/How can I suggest a feature or report a bug/i)).toBeInTheDocument();
    expect(screen.getByText('Is Hobbistas a social network?')).toBeInTheDocument();
    expect(
      screen.getByText('Can I share my library without making my profile public?'),
    ).toBeInTheDocument();
  });

  it('AboutTwoModes contrasts the solo default with the opt-in social layer', () => {
    render(<AboutTwoModes />);

    expect(screen.getByText('Two ways to use Hobbistas')).toBeInTheDocument();
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.getByText('How every account starts')).toBeInTheDocument();
    expect(screen.getByText('Social layer')).toBeInTheDocument();
    expect(screen.getByText('Opt-in — coming soon')).toBeInTheDocument();
  });

  it('AboutWhatYouGet lists only capabilities that are already live', () => {
    render(<AboutWhatYouGet />);

    expect(screen.getByText('What actually works right now')).toBeInTheDocument();
    expect(screen.getByText('Six categories, one library')).toBeInTheDocument();
    expect(screen.getByText('Bring your existing lists')).toBeInTheDocument();
    expect(screen.getByText('Share without going public')).toBeInTheDocument();
    expect(screen.getByText('A diary only you can read')).toBeInTheDocument();
  });

  it('AboutPhilosophy renders the rationale and the boundaries it merged in', () => {
    render(<AboutPhilosophy />);

    expect(screen.getByText('Why Hobbistas exists')).toBeInTheDocument();
    expect(screen.getByText('No engagement notifications')).toBeInTheDocument();
    expect(screen.getByText('No engagement algorithm')).toBeInTheDocument();
    expect(screen.getByText('No data to sell')).toBeInTheDocument();
  });

  it('AboutPeople renders no admin-facing empty state for an empty team', () => {
    const { container } = render(<AboutPeople team={[]} />);
    expect(screen.getByText('Built by people who use it')).toBeInTheDocument();
    expect(screen.queryByText(/no team members found/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="avatar-image"]')).toHaveLength(0);
  });

  it('AboutPeople sorts team, resolves role labels and renders avatar/fallback', () => {
    const team: TeamMember[] = [
      {
        id: '3',
        username: 'charlie',
        display_name: 'Charlie',
        roles: ['reviewer'],
        bio: null,
        avatar_url: null,
        country: null,
        favorite_platform: null,
      },
      {
        id: '1',
        username: 'alpha',
        display_name: 'Alpha',
        roles: ['owner'],
        bio: 'Founder',
        avatar_url: 'https://cdn/avatar.png',
        country: 'GR',
        favorite_platform: 'PC',
      },
      {
        id: '2',
        username: 'beta',
        display_name: null,
        roles: ['unknown-role'],
        bio: 'Bio',
        avatar_url: null,
        country: 'US',
        favorite_platform: 'PS5',
      },
    ];

    const { container } = render(<AboutPeople team={team} />);

    expect(screen.getByText('Built by people who use it')).toBeInTheDocument();
    expect(screen.getAllByText('Founder').length).toBeGreaterThan(0);
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
    expect(screen.getByText('user')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-image')).toHaveAttribute('aria-label', 'Alpha');
    expect(screen.getByText('@alpha')).toBeInTheDocument();
    expect(screen.getByText('GR')).toBeInTheDocument();
    expect(screen.getByText('PC')).toBeInTheDocument();

    const text = container.textContent ?? '';
    expect(text.indexOf('Alpha')).toBeLessThan(text.indexOf('Charlie'));
    expect(text.indexOf('Charlie')).toBeLessThan(text.indexOf('beta'));
  });

  it('AboutPeople covers role-array guard, avatar alt fallback, and same-rank locale sorting', () => {
    type TeamMemberWithNullableRoles = Omit<TeamMember, 'roles'> & { roles: string[] | null };
    const team: TeamMemberWithNullableRoles[] = [
      {
        id: 'a2',
        username: 'zeta',
        display_name: null,
        roles: ['author'],
        bio: null,
        avatar_url: 'https://cdn/zeta.png',
        country: null,
        favorite_platform: null,
      },
      {
        id: 'a1',
        username: 'alpha',
        display_name: null,
        roles: ['author'],
        bio: null,
        avatar_url: null,
        country: null,
        favorite_platform: null,
      },
      {
        id: 'x1',
        username: 'guard',
        display_name: null,
        roles: null,
        bio: null,
        avatar_url: null,
        country: null,
        favorite_platform: null,
      },
    ];

    const { container } = render(<AboutPeople team={team as unknown as TeamMember[]} />);

    expect(screen.getByTestId('avatar-image')).toHaveAttribute('aria-label', 'zeta');
    expect(screen.getAllByText('Author').length).toBeGreaterThan(0);

    const text = container.textContent ?? '';
    expect(text.indexOf('alpha')).toBeLessThan(text.indexOf('zeta'));
    expect(text).toContain('guard');
  });

  it('AboutPeople covers defensive rank -1 fallback branch in sorter', () => {
    const originalIndexOf = Array.prototype.indexOf;
    const indexSpy = jest.spyOn(Array.prototype, 'indexOf').mockImplementation(function (
      this: unknown[],
      searchElement: unknown,
      fromIndex?: number,
    ) {
      if (
        this.length === 6 &&
        this[0] === 'owner' &&
        this[5] === 'user' &&
        searchElement === 'author'
      ) {
        return -1;
      }
      return originalIndexOf.call(this, searchElement as never, fromIndex as never);
    });

    const team: TeamMember[] = [
      {
        id: 'o',
        username: 'owner-user',
        display_name: 'Owner User',
        roles: ['owner'],
        bio: null,
        avatar_url: null,
        country: null,
        favorite_platform: null,
      },
      {
        id: 'a',
        username: 'author-user',
        display_name: 'Author User',
        roles: ['author'],
        bio: null,
        avatar_url: null,
        country: null,
        favorite_platform: null,
      },
    ];

    render(<AboutPeople team={team} />);
    expect(screen.getByText('Owner User')).toBeInTheDocument();
    expect(screen.getByText('Author User')).toBeInTheDocument();
    indexSpy.mockRestore();
  });

  it('AboutPeople covers defensive rankB -1 fallback branch in sorter', () => {
    const originalIndexOf = Array.prototype.indexOf;
    const indexSpy = jest.spyOn(Array.prototype, 'indexOf').mockImplementation(function (
      this: unknown[],
      searchElement: unknown,
      fromIndex?: number,
    ) {
      if (
        this.length === 6 &&
        this[0] === 'owner' &&
        this[5] === 'user' &&
        searchElement === 'owner'
      ) {
        return -1;
      }
      return originalIndexOf.call(this, searchElement as never, fromIndex as never);
    });

    const team: TeamMember[] = [
      {
        id: 'o',
        username: 'owner-user-b',
        display_name: 'Owner User B',
        roles: ['owner'],
        bio: null,
        avatar_url: null,
        country: null,
        favorite_platform: null,
      },
      {
        id: 'a',
        username: 'author-user-b',
        display_name: 'Author User B',
        roles: ['author'],
        bio: null,
        avatar_url: null,
        country: null,
        favorite_platform: null,
      },
    ];

    render(<AboutPeople team={team} />);
    expect(screen.getByText('Owner User B')).toBeInTheDocument();
    expect(screen.getByText('Author User B')).toBeInTheDocument();
    indexSpy.mockRestore();
  });

  it('AboutRoadmap renders roadmap cards and status labels', () => {
    render(<AboutRoadmap />);
    expect(screen.getByText('What is next')).toBeInTheDocument();
    expect(screen.getByText('Item done')).toBeInTheDocument();
    expect(screen.getByText('Item in-progress')).toBeInTheDocument();
    expect(screen.getByText('Item planned')).toBeInTheDocument();
    expect(screen.getByText('status:done')).toBeInTheDocument();
    expect(screen.getByText('status:in-progress')).toBeInTheDocument();
    expect(screen.getByText('status:planned')).toBeInTheDocument();
    expect(screen.getByText('Shipped')).toBeInTheDocument();
    expect(screen.getByText('Being built')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
  });

  it('index.ts exports all public about modules', () => {
    expect(typeof AboutIndex.AboutHero).toBe('function');
    expect(typeof AboutIndex.AboutTwoModes).toBe('function');
    expect(typeof AboutIndex.AboutWhatYouGet).toBe('function');
    expect(typeof AboutIndex.AboutPhilosophy).toBe('function');
    expect(typeof AboutIndex.AboutRoadmap).toBe('function');
    expect(typeof AboutIndex.AboutPeople).toBe('function');
    expect(typeof AboutIndex.AboutFAQ).toBe('function');
    expect(typeof AboutIndex.AboutFinalCTA).toBe('function');
  });
});
