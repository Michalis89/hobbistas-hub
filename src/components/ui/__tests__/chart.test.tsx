import { render, screen } from '@testing-library/react';
import {
  ChartContainer,
  ChartLegendContent,
  ChartStyle,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="chart-tooltip">{children}</div>
  ),
  Legend: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="chart-legend">{children}</div>
  ),
}));

const Icon = () => <svg data-testid="series-icon" />;

const config = {
  desktop: { label: 'Desktop', color: '#2563eb' },
  mobile: { label: 'Mobile', theme: { light: '#16a34a', dark: '#22c55e' } },
  iconSeries: { label: 'Icon series', icon: Icon },
} satisfies ChartConfig;

function renderInChart(children: React.ReactNode, chartConfig: ChartConfig = config) {
  return render(
    <ChartContainer id="traffic" config={chartConfig}>
      {children}
    </ChartContainer>,
  );
}

describe('ChartContainer and ChartStyle', () => {
  it('provides chart context, responsive container, merged classes, and CSS variables', () => {
    renderInChart(<div data-testid="chart-child" />, config);

    const chart = screen.getByTestId('responsive-container').parentElement;
    expect(chart).toHaveAttribute('data-chart', 'chart-traffic');
    expect(chart).toHaveClass('flex', 'aspect-video', 'justify-center');
    expect(screen.getByTestId('chart-child')).toBeInTheDocument();

    const style = document.querySelector('style');
    expect(style?.textContent).toContain('[data-chart=chart-traffic]');
    expect(style?.textContent).toContain('--color-desktop: #2563eb');
    expect(style?.textContent).toContain('--color-mobile: #16a34a');
    expect(style?.textContent).toContain('.dark [data-chart=chart-traffic]');
    expect(style?.textContent).toContain('--color-mobile: #22c55e');
  });

  it('generates a stable chart id when no id is provided', () => {
    render(
      <ChartContainer config={config}>
        <div />
      </ChartContainer>,
    );

    expect(screen.getByTestId('responsive-container').parentElement).toHaveAttribute(
      'data-chart',
      expect.stringMatching(/^chart-/),
    );
  });

  it('renders no style tag when no config color is present', () => {
    const { container } = render(<ChartStyle id="empty" config={{ plain: { label: 'Plain' } }} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('omits missing themed colors from generated CSS', () => {
    render(
      <ChartStyle
        id="partial"
        config={{ partial: { label: 'Partial', theme: { light: '#111827' } } as ChartConfig['x'] }}
      />,
    );

    expect(document.querySelector('style')?.textContent).toContain('--color-partial: #111827');
  });
});

describe('ChartTooltipContent', () => {
  it('throws outside chart context', () => {
    expect(() => render(<ChartTooltipContent active payload={[]} />)).toThrow(
      'useChart must be used within a <ChartContainer />',
    );
  });

  it('renders nothing when inactive or payload is empty', () => {
    const { container, rerender } = renderInChart(
      <ChartTooltipContent active={false} payload={[]} />,
    );

    expect(container.querySelector('[class*="min-w"]')).not.toBeInTheDocument();

    rerender(
      <ChartContainer id="traffic" config={config}>
        <ChartTooltipContent active payload={[]} />
      </ChartContainer>,
    );
    expect(container.querySelector('[class*="min-w"]')).not.toBeInTheDocument();
  });

  it('handles invalid inactive payloads without rendering', () => {
    const { container } = renderInChart(
      <ChartTooltipContent active={false} payload={[null] as unknown as []} />,
    );

    expect(container.querySelector('[class*="min-w"]')).not.toBeInTheDocument();
  });

  it('renders label, indicators, values, and filters hidden payload items', () => {
    renderInChart(
      <ChartTooltipContent
        active
        label="desktop"
        payload={[
          {
            color: '#2563eb',
            dataKey: 'desktop',
            name: 'desktop',
            payload: { fill: '#111827' },
            type: 'square',
            value: 1200,
          },
          {
            color: '#ef4444',
            dataKey: 'hidden',
            name: 'hidden',
            type: 'none',
            value: 20,
          },
        ]}
      />,
    );

    expect(screen.getAllByText('Desktop')).toHaveLength(2);
    // The component formats with toLocaleString(); assert the same way rather
    // than hard-coding en-US grouping separators.
    expect(screen.getByText((1200).toLocaleString())).toBeInTheDocument();
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
  });

  it('supports nested labels, dashed indicators, label formatters, and nameKey lookup', () => {
    renderInChart(
      <ChartTooltipContent
        active
        indicator="dashed"
        labelKey="series"
        nameKey="series"
        labelFormatter={value => `Label: ${value}`}
        payload={[
          {
            color: '#16a34a',
            dataKey: 'visits',
            name: 'visits',
            payload: { series: 'mobile' },
            type: 'square',
            value: 42,
          },
        ]}
      />,
    );

    expect(screen.getByText('Label: Mobile')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('supports custom formatter, icons, hidden labels, hidden indicators, and labelKey', () => {
    renderInChart(
      <ChartTooltipContent
        active
        hideLabel
        hideIndicator
        labelKey="series"
        formatter={(value, name) => <span>{`${name}: ${value}`}</span>}
        payload={[
          {
            color: '#9333ea',
            dataKey: 'value',
            name: 'custom',
            payload: { series: 'iconSeries' },
            type: 'square',
            value: 9,
          },
        ]}
      />,
    );

    expect(screen.getByText('custom: 9')).toBeInTheDocument();
    expect(screen.queryByText('Icon series')).not.toBeInTheDocument();
  });

  it('renders icon config when no custom formatter is provided', () => {
    renderInChart(
      <ChartTooltipContent
        active
        payload={[
          {
            color: '#9333ea',
            dataKey: 'iconSeries',
            name: 'iconSeries',
            payload: {},
            type: 'square',
            value: 5,
          },
        ]}
      />,
    );

    expect(screen.getByTestId('series-icon')).toBeInTheDocument();
    expect(screen.getAllByText('Icon series')).toHaveLength(2);
  });

  it('renders no label when a tooltip item has no configured label', () => {
    renderInChart(
      <ChartTooltipContent
        active
        payload={[
          {
            color: '#64748b',
            dataKey: 'raw',
            name: 'Raw name',
            payload: {},
            type: 'square',
            value: 0,
          },
        ]}
      />,
      {},
    );

    expect(screen.queryByText('raw')).not.toBeInTheDocument();
    expect(screen.getByText('Raw name')).toBeInTheDocument();
  });

  it('falls back to raw labels and value keys for sparse tooltip payloads', () => {
    renderInChart(
      <ChartTooltipContent
        active
        label="fallbackLabel"
        payload={[
          {
            color: '#16a34a',
            dataKey: 'mobile',
            payload: {},
            type: 'square',
            value: 7,
          },
          {
            color: '#64748b',
            dataKey: '',
            payload: {},
            type: 'square',
            value: 3,
          },
        ]}
      />,
      {
        mobile: { label: 'Mobile' },
        value: { label: 'Value label' },
      },
    );

    expect(screen.getByText('fallbackLabel')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.getByText('Value label')).toBeInTheDocument();
  });

  it('uses payload names when tooltip label keys are not available', () => {
    renderInChart(
      <ChartTooltipContent
        active
        payload={[
          {
            color: '#16a34a',
            dataKey: '',
            name: 'mobile',
            payload: {},
            type: 'square',
            value: 7,
          },
        ]}
      />,
    );

    expect(screen.getAllByText('Mobile')).toHaveLength(2);
  });

  it('uses direct payload keys when resolving tooltip config', () => {
    renderInChart(
      <ChartTooltipContent
        active
        nameKey="series"
        payload={[
          {
            color: '#16a34a',
            dataKey: 'visits',
            name: 'visits',
            payload: {},
            series: 'mobile',
            type: 'square',
            value: 17,
          },
        ]}
      />,
    );

    expect(screen.getAllByText('Mobile')).toHaveLength(1);
  });
});

describe('ChartLegendContent', () => {
  it('renders nothing without payload', () => {
    const { container } = renderInChart(<ChartLegendContent payload={[]} />);

    expect(container).not.toHaveTextContent('Desktop');
    expect(container).not.toHaveTextContent('Mobile');
  });

  it('renders legend items, top alignment, icons, fallback swatches, and filters hidden items', () => {
    renderInChart(
      <ChartLegendContent
        verticalAlign="top"
        payload={[
          { color: '#2563eb', dataKey: 'desktop', type: 'square', value: 'desktop' },
          { color: '#9333ea', dataKey: 'iconSeries', type: 'square', value: 'iconSeries' },
          { color: '#ef4444', dataKey: 'hidden', type: 'none', value: 'hidden' },
        ]}
      />,
    );

    expect(screen.getByText('Desktop')).toBeInTheDocument();
    expect(screen.getByText('Icon series')).toBeInTheDocument();
    expect(screen.getByTestId('series-icon')).toBeInTheDocument();
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
    expect(screen.getByText('Desktop').parentElement).toHaveClass('pb-3');
  });

  it('supports nameKey and hidden icons', () => {
    renderInChart(
      <ChartLegendContent
        hideIcon
        nameKey="series"
        payload={[
          {
            color: '#16a34a',
            dataKey: 'visits',
            payload: { series: 'mobile' },
            type: 'square',
            value: 'visits',
          },
        ]}
      />,
    );

    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.queryByTestId('series-icon')).not.toBeInTheDocument();
  });

  it('falls back to value keys and labels when legend config is missing', () => {
    renderInChart(
      <ChartLegendContent payload={[{ color: '#64748b', type: 'square', value: 'fallback' }]} />,
      { fallback: { label: 'Fallback label' } },
    );

    expect(screen.getByText('Fallback label')).toBeInTheDocument();
  });
});
