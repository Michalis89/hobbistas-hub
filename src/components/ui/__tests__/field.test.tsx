import { render, screen } from '@testing-library/react';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';

describe('Field layout primitives', () => {
  it('renders fieldset, legend, and group slots with classes and forwarded props', () => {
    render(
      <FieldSet className="custom-set" data-testid="field-set">
        <FieldLegend className="custom-legend">Preferences</FieldLegend>
        <FieldLegend variant="label">Display options</FieldLegend>
        <FieldGroup className="custom-group" data-testid="field-group">
          Group content
        </FieldGroup>
      </FieldSet>,
    );

    const fieldSet = screen.getByTestId('field-set');
    expect(fieldSet.tagName).toBe('FIELDSET');
    expect(fieldSet).toHaveAttribute('data-slot', 'field-set');
    expect(fieldSet).toHaveClass('flex', 'gap-6', 'custom-set');

    const legend = screen.getByText('Preferences');
    expect(legend.tagName).toBe('LEGEND');
    expect(legend).toHaveAttribute('data-slot', 'field-legend');
    expect(legend).toHaveAttribute('data-variant', 'legend');
    expect(legend).toHaveClass('font-medium', 'custom-legend');

    expect(screen.getByText('Display options')).toHaveAttribute('data-variant', 'label');
    expect(screen.getByTestId('field-group')).toHaveAttribute('data-slot', 'field-group');
    expect(screen.getByTestId('field-group')).toHaveClass('flex', 'w-full', 'custom-group');
  });

  it('renders vertical, horizontal, and responsive fields', () => {
    render(
      <>
        <Field className="custom-field" data-testid="vertical-field">
          Vertical
        </Field>
        <Field orientation="horizontal" data-testid="horizontal-field">
          Horizontal
        </Field>
        <Field orientation="responsive" data-testid="responsive-field">
          Responsive
        </Field>
      </>,
    );

    const vertical = screen.getByTestId('vertical-field');
    expect(vertical).toHaveAttribute('role', 'group');
    expect(vertical).toHaveAttribute('data-slot', 'field');
    expect(vertical).toHaveAttribute('data-orientation', 'vertical');
    expect(vertical).toHaveClass('flex-col', 'custom-field');

    expect(screen.getByTestId('horizontal-field')).toHaveAttribute(
      'data-orientation',
      'horizontal',
    );
    expect(screen.getByTestId('horizontal-field')).toHaveClass('flex-row', 'items-center');

    expect(screen.getByTestId('responsive-field')).toHaveAttribute(
      'data-orientation',
      'responsive',
    );
    expect(screen.getByTestId('responsive-field')).toHaveClass('flex-col');
  });

  it('renders content, label, title, and description slots', () => {
    render(
      <Field>
        <FieldLabel htmlFor="username" className="custom-label">
          Username
        </FieldLabel>
        <FieldContent className="custom-content" data-testid="field-content">
          <FieldTitle className="custom-title">Account name</FieldTitle>
          <FieldDescription className="custom-description">
            This is shown on your profile.
          </FieldDescription>
        </FieldContent>
      </Field>,
    );

    const label = screen.getByText('Username');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'username');
    expect(label).toHaveAttribute('data-slot', 'field-label');
    expect(label).toHaveClass('custom-label');

    expect(screen.getByTestId('field-content')).toHaveAttribute('data-slot', 'field-content');
    expect(screen.getByTestId('field-content')).toHaveClass('flex-1', 'custom-content');

    const title = screen.getByText('Account name');
    expect(title).toHaveAttribute('data-slot', 'field-label');
    expect(title).toHaveClass('font-medium', 'custom-title');

    const description = screen.getByText('This is shown on your profile.');
    expect(description.tagName).toBe('P');
    expect(description).toHaveAttribute('data-slot', 'field-description');
    expect(description).toHaveClass('text-muted-foreground', 'custom-description');
  });

  it('renders separators with and without centered content', () => {
    const { rerender } = render(<FieldSeparator className="custom-separator" />);

    const separator = document.querySelector('[data-slot="field-separator"]');
    expect(separator).toHaveAttribute('data-content', 'false');
    expect(separator).toHaveClass('relative', 'custom-separator');
    expect(document.querySelector('[data-slot="field-separator-content"]')).not.toBeInTheDocument();
    expect(screen.getByRole('none')).toHaveClass('absolute', 'top-1/2');

    rerender(<FieldSeparator>Or continue</FieldSeparator>);

    expect(document.querySelector('[data-slot="field-separator"]')).toHaveAttribute(
      'data-content',
      'true',
    );
    expect(screen.getByText('Or continue')).toHaveAttribute('data-slot', 'field-separator-content');
  });
});

describe('FieldError', () => {
  it('renders nothing without children or errors', () => {
    const { container } = render(<FieldError />);

    expect(container).toBeEmptyDOMElement();
  });

  it('prefers explicit children over errors', () => {
    render(
      <FieldError className="custom-error" errors={[{ message: 'From errors' }]}>
        From children
      </FieldError>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-slot', 'field-error');
    expect(alert).toHaveClass('text-destructive', 'custom-error');
    expect(alert).toHaveTextContent('From children');
    expect(alert).not.toHaveTextContent('From errors');
  });

  it('renders one error message directly', () => {
    render(<FieldError errors={[{ message: 'Required field' }]} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Required field');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders multiple error messages as a list and skips missing messages', () => {
    render(
      <FieldError
        errors={[{ message: 'Too short' }, undefined, {}, { message: 'Must include a number' }]}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveClass('list-disc');
    expect(screen.getByText('Too short')).toBeInTheDocument();
    expect(screen.getByText('Must include a number')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
