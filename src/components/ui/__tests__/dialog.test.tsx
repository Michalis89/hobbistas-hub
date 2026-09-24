import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/** jsdom implements <dialog> but not showModal/close, so they are stubbed. */
const showModal = jest.fn(function showModalStub(this: HTMLDialogElement) {
  this.setAttribute('open', '');
});
const close = jest.fn(function closeStub(this: HTMLDialogElement) {
  this.removeAttribute('open');
});

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    writable: true,
    value: showModal,
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    writable: true,
    value: close,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Dialog', () => {
  it('opens a dialog that is already open on its first render', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Gallery</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Gallery')).toBeInTheDocument();
  });

  it('does not open a closed dialog', () => {
    render(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>Gallery</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(showModal).not.toHaveBeenCalled();
  });

  it('closes when the open prop flips back', () => {
    const { rerender } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Gallery</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    rerender(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>Gallery</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('Dialog hydration', () => {
  const tree = (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Gallery</DialogTitle>
      </DialogContent>
    </Dialog>
  );

  function hydrate() {
    const container = document.createElement('div');
    // The server emits nothing for this tree - dialog.ssr.test.tsx pins that
    // - so an empty container is exactly the markup hydration starts from.
    container.innerHTML = '';
    document.body.appendChild(container);

    const errors: unknown[][] = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });

    act(() => {
      hydrateRoot(container, tree);
    });

    spy.mockRestore();
    return errors;
  }

  it('hydrates without a server/client mismatch', () => {
    // The reported bug: the server rendered nothing while the client
    // rendered a <dialog>, so React threw the tree away and re-rendered it.
    const errors = hydrate();

    const mismatch = errors.filter(args =>
      args.some(arg => typeof arg === 'string' && /hydrat/i.test(arg)),
    );
    expect(mismatch).toEqual([]);
  });

  it('still calls showModal once the portal exists after hydration', () => {
    // The portal is absent on the hydrating render, so the effect that opens
    // the dialog has to re-run when it appears. Without `isMounted` in its
    // dependencies a dialog hydrated open would never be shown.
    hydrate();

    expect(showModal).toHaveBeenCalled();
  });
});
