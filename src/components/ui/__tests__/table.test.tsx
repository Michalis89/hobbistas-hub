import { render, screen, within } from '@testing-library/react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

describe('Table components', () => {
  it('renders table primitives with merged classes and forwarded refs', () => {
    const tableRef = jest.fn();
    const headerRef = jest.fn();
    const bodyRef = jest.fn();
    const footerRef = jest.fn();
    const rowRef = jest.fn();
    const headRef = jest.fn();
    const cellRef = jest.fn();
    const captionRef = jest.fn();

    render(
      <Table ref={tableRef} className="custom-table" data-testid="table">
        <TableCaption ref={captionRef} className="custom-caption">
          Recent hobbies
        </TableCaption>
        <TableHeader ref={headerRef} className="custom-header" data-testid="header">
          <TableRow ref={rowRef} className="custom-row" data-state="selected">
            <TableHead ref={headRef} className="custom-head" scope="col">
              Title
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody ref={bodyRef} className="custom-body" data-testid="body">
          <TableRow>
            <TableCell ref={cellRef} className="custom-cell">
              Dune
            </TableCell>
          </TableRow>
        </TableBody>
        <TableFooter ref={footerRef} className="custom-footer" data-testid="footer">
          <TableRow>
            <TableCell>Total</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    const table = screen.getByRole('table', { name: 'Recent hobbies' });
    expect(table).toBe(screen.getByTestId('table'));
    expect(table.parentElement).toHaveClass('relative', 'w-full', 'overflow-auto');
    expect(table).toHaveClass('w-full', 'caption-bottom', 'text-sm', 'custom-table');

    expect(screen.getByText('Recent hobbies')).toHaveClass(
      'mt-4',
      'text-sm',
      'text-muted-foreground',
      'custom-caption',
    );
    expect(screen.getByTestId('header')).toHaveClass('[&_tr]:border-b', 'custom-header');
    expect(screen.getByTestId('body')).toHaveClass('[&_tr:last-child]:border-0', 'custom-body');
    expect(screen.getByTestId('footer')).toHaveClass(
      'border-t',
      'bg-muted/50',
      'font-medium',
      'custom-footer',
    );

    const columnHeader = screen.getByRole('columnheader', { name: 'Title' });
    expect(columnHeader).toHaveAttribute('scope', 'col');
    expect(columnHeader).toHaveClass('h-10', 'text-left', 'custom-head');

    const selectedRow = columnHeader.closest('tr');
    expect(selectedRow).toHaveAttribute('data-state', 'selected');
    expect(selectedRow).toHaveClass('border-b', 'hover:bg-muted/50', 'custom-row');

    expect(within(screen.getByTestId('body')).getByRole('cell', { name: 'Dune' })).toHaveClass(
      'p-2',
      'align-middle',
      'custom-cell',
    );
    expect(within(screen.getByTestId('footer')).getByRole('cell', { name: 'Total' })).toHaveClass(
      'p-2',
      'align-middle',
    );

    expect(tableRef).toHaveBeenCalledWith(table);
    expect(headerRef).toHaveBeenCalledWith(screen.getByTestId('header'));
    expect(bodyRef).toHaveBeenCalledWith(screen.getByTestId('body'));
    expect(footerRef).toHaveBeenCalledWith(screen.getByTestId('footer'));
    expect(rowRef).toHaveBeenCalledWith(selectedRow);
    expect(headRef).toHaveBeenCalledWith(columnHeader);
    expect(cellRef).toHaveBeenCalledWith(screen.getByRole('cell', { name: 'Dune' }));
    expect(captionRef).toHaveBeenCalledWith(screen.getByText('Recent hobbies'));
  });
});
