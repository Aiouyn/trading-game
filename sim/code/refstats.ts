import { stats } from './run'; import { readFileSync } from 'fs';
const c = JSON.parse(readFileSync('../out/refs/corpus.json', 'utf8')); console.log(JSON.stringify(stats(c)));
