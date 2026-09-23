import { rm } from 'node:fs/promises';

const targets = ['node_modules', '.next'];

for (const target of targets) {
  try {
    await rm(target, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 500,
    });
  } catch (error) {
    const path = error?.path ? `\nLocked path: ${error.path}` : '';

    console.error(
      `Failed to remove ${target}.${path}\n` +
        'Close any running Next.js, test, or Node processes that may be using this project, then run npm run clean:install again.',
    );
    process.exit(1);
  }
}
