import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as startServer from './commands/startFakeJsonApiServer';

yargs(hideBin(process.argv)).command(startServer).demandCommand().help('h').alias('h', 'help').parse();
