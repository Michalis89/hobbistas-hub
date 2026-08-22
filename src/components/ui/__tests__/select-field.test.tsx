import { fireEvent, render, screen, within } from '@testing-library/react';
import { SelectField } from '@/components/ui/select-field';

jest.mock('@/components/ui/select', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  type SelectContextValue = {
    onValueChange?: (value: string) => void;
    value: string;
  };

  const SelectContext = React.createContext<SelectContextValue>({ value: '' });

  return {
    __esModule: true,
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
      value: string;
    }) => (
      <SelectContext.Provider value={{ onValueChange, value }}>
        <div data-testid="select-root" data-value={value}>
          {children}
        </div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div className={className} data-testid="select-content">
        {children}
      </div>
    ),
    SelectItem: ({
      children,
      className,
      value,
    }: {
      children: React.ReactNode;
      className?: string;
      value: string;
    }) => {
      const context = React.useContext(SelectContext);

      return (
        <button
          className={className}
          data-value={value}
          onClick={() => context.onValueChange?.(value)}
          type="button"
        >
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <button className={className} data-testid="select-trigger" type="button">
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => {
      const context = React.useContext(SelectContext);

      return <span>{context.value || placeholder}</span>;
    },
  };
});

describe('SelectField', () => {
  it('renders label, trigger defaults, content, and plain options', () => {
    render(
      <SelectField label="Category" labelClassName="custom-label" options={['games', 'books']} />,
    );

    expect(screen.getByText('Category')).toHaveClass('text-sm', 'custom-label');
    expect(screen.getByTestId('select-root')).toHaveAttribute('data-value', '');

    const trigger = screen.getByTestId('select-trigger');
    expect(trigger).toHaveClass('min-h-[44px]', 'border-[var(--hb-input-border)]');
    expect(trigger).toHaveTextContent('Select an option');

    expect(screen.getByTestId('select-content')).toHaveClass('max-h-64', 'bg-card');
    expect(screen.getByRole('button', { name: 'games' })).toHaveAttribute('data-value', 'games');
    expect(screen.getByRole('button', { name: 'books' })).toHaveAttribute('data-value', 'books');
  });

  it('renders selected value, custom labels, custom classes, and error state', () => {
    render(
      <SelectField
        className="custom-trigger"
        contentClassName="custom-content"
        error
        label="Status"
        optionLabels={{ done: 'Finished' }}
        options={['planned', 'done']}
        placeholder="Choose status"
        value="done"
      />,
    );

    expect(screen.getByTestId('select-root')).toHaveAttribute('data-value', 'done');
    expect(screen.getByTestId('select-trigger')).toHaveClass('border-red-500', 'custom-trigger');
    expect(screen.getByTestId('select-trigger')).toHaveTextContent('done');
    expect(screen.getByTestId('select-content')).toHaveClass('custom-content');
    expect(screen.getByRole('button', { name: 'planned' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finished' })).toHaveAttribute('data-value', 'done');
  });

  it('normalizes placeholder item selections to an empty value', () => {
    const handleChange = jest.fn();

    render(
      <SelectField
        onChange={handleChange}
        optionLabels={{ '': 'Any status' }}
        options={['', 'active']}
        placeholder="All statuses"
        value="active"
      />,
    );

    expect(screen.getByRole('button', { name: 'Any status' })).toHaveAttribute(
      'data-value',
      '__placeholder__',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Any status' }));
    expect(handleChange).toHaveBeenCalledWith('');

    fireEvent.click(
      within(screen.getByTestId('select-content')).getByRole('button', { name: 'active' }),
    );
    expect(handleChange).toHaveBeenLastCalledWith('active');
  });

  it('supports empty options and missing change handler', () => {
    render(<SelectField options={[]} value={undefined} />);

    expect(screen.queryByRole('button', { name: 'active' })).not.toBeInTheDocument();
    expect(screen.getByTestId('select-trigger')).toHaveTextContent('Select an option');
    expect(screen.queryByText('Category')).not.toBeInTheDocument();
  });
});
