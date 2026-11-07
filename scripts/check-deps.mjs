// Zero-dependency boundary guard for the ChoreoBit monorepo.
//
// It performs two checks over every package manifest under packages/*:
//   1. Allowed-edges: no package may declare an internal dependency outside the
//      approved dependency graph.
//   2. No cycles: the internal dependency graph must be acyclic.
//
// It also enforces the browser/Node boundary by forbidding Node-only
// dependencies in browser-facing packages.
//
// Run: node scripts/check-deps.mjs

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const packagesDir = join(root, 'packages');

// Approved internal dependency graph. A package may depend only on the
// packages listed for it. core has none.
const ALLOWED = {
  '@choreobit/core': [],
  '@choreobit/primitives': ['@choreobit/core'],
  '@choreobit/animation': ['@choreobit/core'],
  '@choreobit/renderer': ['@choreobit/core'],
  '@choreobit/authoring': ['@choreobit/core', '@choreobit/primitives', '@choreobit/animation'],
  '@choreobit/video': ['@choreobit/core', '@choreobit/renderer'],
  '@choreobit/player': [
    '@choreobit/core',
    '@choreobit/primitives',
    '@choreobit/animation',
    '@choreobit/renderer',
  ],
  '@choreobit/react': ['@choreobit/player'],
};

// Packages that run in the browser must not pull in Node-only dependencies.
const BROWSER_PACKAGES = new Set(['@choreobit/player', '@choreobit/react']);
const NODE_ONLY = /^@?node-/;

function internalDeps(deps) {
  return Object.keys(deps).filter((name) => name.startsWith('@choreobit/'));
}

async function loadManifests() {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const manifests = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = JSON.parse(
      await readFile(join(packagesDir, entry.name, 'package.json'), 'utf8'),
    );
    manifests.push(manifest);
  }
  return manifests;
}

function main() {
  return loadManifests()
    .then((manifests) => {
      const errors = [];
      const graph = new Map();

      for (const manifest of manifests) {
        const name = manifest.name;
        const allowed = ALLOWED[name];

        if (allowed === undefined) {
          errors.push(`${name}: not a known ChoreoBit package`);
          continue;
        }

        const deps = { ...(manifest.dependencies ?? {}), ...(manifest.peerDependencies ?? {}) };
        const internal = internalDeps(deps);

        for (const dep of internal) {
          if (allowed.indexOf(dep) === -1) {
            errors.push(`${name}: disallowed internal dependency ${dep}`);
          }
        }

        if (BROWSER_PACKAGES.has(name)) {
          for (const dep of Object.keys(manifest.dependencies ?? {})) {
            if (NODE_ONLY.test(dep)) {
              errors.push(`${name}: browser package must not depend on Node-only ${dep}`);
            }
          }
        }

        graph.set(name, internal);
      }

      const visiting = new Set();
      const visited = new Set();
      const path = [];

      const visit = (node) => {
        if (visited.has(node)) return;
        if (visiting.has(node)) {
          errors.push(`circular dependency: ${[...path, node].join(' -> ')}`);
          return;
        }
        visiting.add(node);
        path.push(node);
        for (const dep of graph.get(node) ?? []) visit(dep);
        path.pop();
        visiting.delete(node);
        visited.add(node);
      };

      for (const node of graph.keys()) visit(node);

      if (errors.length > 0) {
        console.error('Dependency boundary check FAILED:');
        for (const error of errors) console.error(`  - ${error}`);
        process.exit(1);
      }

      const edges = [...graph.values()].reduce((sum, deps) => sum + deps.length, 0);
      console.log(
        `Dependency boundary check passed: ${graph.size} packages, ${edges} internal edges, no cycles.`,
      );
    })
    .catch((error) => {
      console.error(
        `Dependency boundary check errored: ${error instanceof Error ? error.message : error}`,
      );
      process.exit(1);
    });
}

main();
