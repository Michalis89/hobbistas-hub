/**
 * @jest-environment node
 */

import { renderToString } from 'react-dom/server.node';
import { Sheet, SheetContent } from '@/components/ui/sheet';

describe('SheetContent SSR guard', () => {
  it('renders nothing without a browser window', () => {
    expect(
      renderToString(
        <Sheet open>
          <SheetContent>Server panel</SheetContent>
        </Sheet>,
      ),
    ).toBe('');
  });
});
