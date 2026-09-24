/**
 * @jest-environment node
 */
import { renderToString } from 'react-dom/server';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

describe('Dialog on the server', () => {
  // DialogContent portals into document.body, which does not exist during a
  // server render. It used to branch on `typeof window`, so the server
  // produced nothing while the client produced a <dialog> - the exact
  // server/client branch React names in its hydration-mismatch message.
  // Rendering nothing here is correct; what matters is that the client's
  // first render agrees, which useSyncExternalStore's server snapshot gives.
  it('renders nothing rather than reaching for document', () => {
    expect(() =>
      renderToString(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Gallery</DialogTitle>
          </DialogContent>
        </Dialog>,
      ),
    ).not.toThrow();
  });

  it('emits no markup for the portal', () => {
    const html = renderToString(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Gallery</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(html).toBe('');
  });
});
