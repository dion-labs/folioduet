import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSync, toMarkdownBytes } from '@firecrawl/anydoc-wasm';

const require = createRequire(import.meta.url);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const localEvaluationRoot = resolve(repositoryRoot, 'local-evals');

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node tools/pdf-eval/extract-anydoc.mjs --input /path/book.pdf --output local-evals/book-001/anydoc.md');
  process.exitCode = 1;
}

const inputOption = readOption('--input');
const outputOption = readOption('--output');

if (!inputOption || !outputOption) {
  usage('Both --input and --output are required.');
} else {
  const inputPath = resolve(inputOption);
  const outputPath = resolve(repositoryRoot, outputOption);
  const outputRelative = relative(localEvaluationRoot, outputPath);

  if (outputRelative.startsWith('..') || isAbsolute(outputRelative)) {
    usage('Refusing to write source-derived Markdown outside local-evals/.');
  } else if (!outputPath.endsWith('.md')) {
    usage('--output must end in .md.');
  } else {
    const packageJsonPath = require.resolve('@firecrawl/anydoc-wasm/package.json');
    const packageDirectory = dirname(packageJsonPath);
    const wasmBytes = await readFile(resolve(packageDirectory, 'anydoc_wasm_bg.wasm'));
    const inputBytes = await readFile(inputPath);
    const inputStats = await stat(inputPath);
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));

    initSync({ module: wasmBytes });
    const markdown = toMarkdownBytes(inputBytes, 'pdf');

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');
    await writeFile(
      `${outputPath}.meta.json`,
      `${JSON.stringify({
        schemaVersion: 1,
        sourceSha256: createHash('sha256').update(inputBytes).digest('hex'),
        sourceBytes: inputStats.size,
        extractor: '@firecrawl/anydoc-wasm',
        extractorVersion: packageJson.version,
        extractedAt: new Date().toISOString(),
      }, null, 2)}\n`,
      'utf8',
    );

    console.log(`Wrote local baseline to ${relative(repositoryRoot, outputPath)}`);
  }
}
