import esbuild from 'esbuild'
import process from 'process'
import { builtinModules as builtins } from 'module'

const banner = `/*
THIS IS A GENERATED/COMPILED FILE AND NOT MEANT TO BE EDITED.
Better Tabs and Notes - https://github.com/theshayneb/better-tabs-and-notes
*/
`

const prod = process.argv[2] === 'production'

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins,
  ],
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  minify: prod,
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
})

if (prod) {
  await context.rebuild()
  process.exit(0)
} else {
  await context.watch()
}
