import './fixture-clock.ts';
import {readFileSync} from 'node:fs';
import {createDatabase} from '../src/db';
import {ingestGraphSource} from '../src/evidence-ingestion';
const db=createDatabase(process.argv[2]);
try{const result=ingestGraphSource(db,JSON.parse(readFileSync(process.argv[3],'utf-8')),JSON.parse(readFileSync(process.argv[4],'utf-8')));process.stdout.write(JSON.stringify(result));}finally{db.close();}
