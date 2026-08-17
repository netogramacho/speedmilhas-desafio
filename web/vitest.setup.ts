import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Sem `test.globals: true` no vitest.config.ts (decisão da spec DSM-9): o auto-cleanup do
// Testing Library depende de `afterEach` global, que não existe aqui — registra manualmente.
afterEach(cleanup);
