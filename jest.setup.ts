// This import is what gives every spec the jest-dom matchers: it augments
// `jest.Matchers` globally for the whole TypeScript program, which is how v6 is
// meant to be wired.
//
// So it is not redundant with `compilerOptions.types` in tsconfig.json, and
// jest-dom is deliberately absent from that list. Listed there it was the one
// type reference with no `@types/*` package behind it, so it resolved only
// through the node_modules fallback - and that is the lookup the editor left
// cached as failed after a reinstall, reporting TS2688 against tsconfig.json
// until the language server was restarted. node_modules sits in
// `files.watcherExclude`, so nothing told it the folder had come back.

import '@testing-library/jest-dom';
