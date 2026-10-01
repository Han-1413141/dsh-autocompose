import { build } from 'esbuild';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const normalizedSources = { name: 'consistent-source-maps', setup(build) {
  build.onLoad({ filter: /\.tsx?$/ }, async args => ({ contents: (await readFile(args.path, 'utf8')).replace(/\r\n/g, '\n'), loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' }));
} };
await build({ entryPoints: ['index','cli','core','typert','environment-entry'].map(x=>'src/'+x+'.ts'), outdir:'lib', bundle:true, platform:'node', format:'esm', target:'node22', packages:'external', sourcemap:true, plugins: [normalizedSources],
  alias: Object.fromEntries(['@deepseek-ai/dsh-sdk-client', '@deepseek-ai/dsh-sdk-protocol'].map(name => [name, require.resolve(name)])) });
await build({ entryPoints:['src/client.tsx'], outfile:'lib/client.js', bundle:true, format:'cjs', platform:'browser', target:'es2022', minify:true,
  external:['react','react/jsx-runtime','react-dom','@deepseek-ai/dsh-client-ui-primitives'], loader:{'.css':'text'},
  banner:{js:'window.__ModuleLoader__.load({id:'+JSON.stringify(pkg.name)+',factory:(require)=>{var module={exports:{}};var exports=module.exports;'}, footer:{js:'return module.exports;}});'} });
const size = (await stat('lib/client.js')).size;
if (size > 262144) throw new Error('Web client exceeds 256 KiB: '+size);
console.log(pkg.name+' '+pkg.version+' built; client '+size+' bytes');
