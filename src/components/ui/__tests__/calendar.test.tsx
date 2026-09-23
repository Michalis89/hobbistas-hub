import { render, screen } from '@testing-library/react';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';

const mockDayPicker = jest.fn(
  ({
    captionLayout,
    className,
    classNames,
    components,
    formatters,
    showOutsideDays,
  }: {
    captionLayout: string;
    className: string;
    classNames: Record<string, string>;
    components: Record<string, React.ComponentType<Record<string, unknown>>>;
    formatters: { formatMonthDropdown: (date: Date) => string };
    showOutsideDays: boolean;
  }) => {
    const Root = components.Root;
    const Chevron = components.Chevron;
    const DayButton = components.DayButton;
    const WeekNumber = components.WeekNumber;
    const rootRef = jest.fn();

    return (
      <Root className={className} rootRef={rootRef}>
        <div data-testid="show-outside-days">{String(showOutsideDays)}</div>
        <div data-testid="caption-layout">{captionLayout}</div>
        <div data-testid="caption-label-class">{classNames.caption_label}</div>
        <div data-testid="button-previous-class">{classNames.button_previous}</div>
        <div data-testid="formatted-month">
          {formatters.formatMonthDropdown(new Date('2026-08-01T00:00:00Z'))}
        </div>
        <Chevron orientation="left" data-testid="chevron-left" />
        <Chevron orientation="right" data-testid="chevron-right" />
        <Chevron data-testid="chevron-down" />
        <table>
          <tbody>
            <tr>
              <WeekNumber>34</WeekNumber>
            </tr>
          </tbody>
        </table>
        <DayButton
          day={{ date: new Date('2026-08-22T00:00:00Z') }}
          modifiers={{ focused: true, selected: true }}
        >
          22
        </DayButton>
      </Root>
    );
  },
);

jest.mock('react-day-picker', () => ({
  DayPicker: (props: Record<string, unknown>) => mockDayPicker(props),
  getDefaultClassNames: () => ({
    root: 'rdp-root',
    months: 'rdp-months',
    month: 'rdp-month',
    nav: 'rdp-nav',
    button_previous: 'rdp-button_previous',
    button_next: 'rdp-button_next',
    month_caption: 'rdp-month_caption',
    dropdowns: 'rdp-dropdowns',
    dropdown_root: 'rdp-dropdown_root',
    dropdown: 'rdp-dropdown',
    caption_label: 'rdp-caption_label',
    weekdays: 'rdp-weekdays',
    weekday: 'rdp-weekday',
    week: 'rdp-week',
    week_number_header: 'rdp-week_number_header',
    week_number: 'rdp-week_number',
    day: 'rdp-day',
    range_start: 'rdp-range_start',
    range_middle: 'rdp-range_middle',
    range_end: 'rdp-range_end',
    today: 'rdp-today',
    outside: 'rdp-outside',
    disabled: 'rdp-disabled',
    hidden: 'rdp-hidden',
  }),
}));

describe('Calendar', () => {
  beforeEach(() => {
    mockDayPicker.mockClear();
  });

  it('passes defaults, merged classes, default formatter, and built-in components to DayPicker', () => {
    render(<Calendar className="rounded-md" buttonVariant="outline" />);

    const root = screen.getByTestId('show-outside-days').parentElement;
    expect(screen.getByTestId('show-outside-days')).toHaveTextContent('true');
    expect(screen.getByTestId('caption-layout')).toHaveTextContent('label');
    // Asserted through the same formatting call the component makes, so the
    // suite does not depend on the machine's system locale.
    const expectedMonth = new Date('2026-08-01T00:00:00Z').toLocaleString('default', {
      month: 'short',
    });
    expect(screen.getByTestId('formatted-month')).toHaveTextContent(expectedMonth);
    expect(screen.getByTestId('caption-label-class')).toHaveTextContent('text-sm');
    expect(screen.getByTestId('button-previous-class')).toHaveTextContent('rdp-button_previous');
    expect(root).toHaveAttribute('data-slot', 'calendar');
    expect(root).toHaveClass('group/calendar', 'bg-background', 'rounded-md');
    expect(screen.getByTestId('chevron-left').tagName.toLowerCase()).toBe('svg');
    expect(screen.getByTestId('chevron-right').tagName.toLowerCase()).toBe('svg');
    expect(screen.getByTestId('chevron-down').tagName.toLowerCase()).toBe('svg');
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '22' })).toHaveAttribute(
      'data-selected-single',
      'true',
    );
  });

  it('uses non-label caption classes, custom formatter, classNames, components, and props', () => {
    const CustomChevron = ({ orientation }: { orientation?: string }) => (
      <span data-testid={`custom-chevron-${orientation ?? 'down'}`} />
    );

    render(
      <Calendar
        showOutsideDays={false}
        captionLayout="dropdown"
        formatters={{ formatMonthDropdown: () => 'Custom month' }}
        classNames={{ caption_label: 'custom-caption' }}
        components={{ Chevron: CustomChevron }}
        numberOfMonths={2}
      />,
    );

    expect(screen.getByTestId('show-outside-days')).toHaveTextContent('false');
    expect(screen.getByTestId('caption-layout')).toHaveTextContent('dropdown');
    expect(screen.getByTestId('caption-label-class')).toHaveTextContent('custom-caption');
    expect(screen.getByTestId('formatted-month')).toHaveTextContent('Custom month');
    expect(screen.getByTestId('custom-chevron-left')).toBeInTheDocument();
    expect(mockDayPicker).toHaveBeenLastCalledWith(expect.objectContaining({ numberOfMonths: 2 }));
  });
});

describe('CalendarDayButton', () => {
  it('marks range dates and forwards props', () => {
    render(
      <CalendarDayButton
        day={{ date: new Date('2026-08-23T00:00:00Z') }}
        modifiers={{
          focused: false,
          selected: true,
          range_start: true,
          range_end: true,
          range_middle: true,
        }}
        className="custom-day"
        aria-label="Range day"
      />,
    );

    const button = screen.getByRole('button', { name: 'Range day' });
    expect(button).toHaveAttribute('data-selected-single', 'false');
    expect(button).toHaveAttribute('data-range-start', 'true');
    expect(button).toHaveAttribute('data-range-end', 'true');
    expect(button).toHaveAttribute('data-range-middle', 'true');
    expect(button).toHaveClass('custom-day', 'rdp-day');
  });

  it('focuses the button when the focused modifier is set', () => {
    render(
      <CalendarDayButton
        day={{ date: new Date('2026-08-24T00:00:00Z') }}
        modifiers={{ focused: true }}
      >
        24
      </CalendarDayButton>,
    );

    expect(screen.getByRole('button', { name: '24' })).toHaveFocus();
  });
});
