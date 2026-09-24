'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

type BackButtonProps = {
  fallbackHref?: string;
  label?: string;
  className?: string;
};

const STANDALONE_QUERY = '(display-mode: standalone)';

function subscribe(onStoreChange: () => void) {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

function getSnapshot() {
  return (
    window.matchMedia(STANDALONE_QUERY).matches ||
    // iOS legacy standalone flag
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * A request has no display mode, so the server can only answer "not
 * installed" and let the browser correct it on hydration.
 */
const getServerSnapshot = () => false;

export default function BackButton({
  fallbackHref = '/home',
  label = 'Back',
  className,
}: BackButtonProps) {
  const router = useRouter();

  // `useSyncExternalStore` rather than `useState`: a `'use client'` component
  // still renders on the server for the initial HTML, and reading `window` in
  // a state initialiser threw there. This also gives React an explicit server
  // snapshot, so the pre-hydration markup matches instead of mismatching, and
  // the button appears or disappears if the display mode changes.
  const isStandalone = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!isStandalone) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="secondary"
      icon={<ArrowLeft size={16} />}
      className={className}
      onClick={() => {
        // Read at click time, not during render: by the time somebody presses
        // this, the history length may differ from what it was on mount.
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
    >
      {label}
    </Button>
  );
}
