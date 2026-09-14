import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Loader customizado para resolver Next.js server specifiers no Node.js puro
register(pathToFileURL('./scripts/next-resolver-loader.mjs'));
