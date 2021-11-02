import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import fakeJsonApiServer from 'fake-json-api-server/src/nodeServer';

const dataPathPrefix = './data/json-api';
const bookstoreDataPathDef = [dataPathPrefix, 'book-store/v1'].join('/');
const dataNameDef = 'default.json';
const resourceDef = [bookstoreDataPathDef, dataNameDef].join('/');

const aliases = ['startServer', '$0'];
const command = ['startServer [options]'];
const describe = 'Starts the memory storage (fake) json-api express listener.';
const builder = (yargs) => {
  return yargs
    .option('r', {
      alias: 'resourcePath',
      default: resourceDef,
      describe: 'A path to a js file containing a single function export which returns the fake json-api server options.',
      nArgs: 1,
      type: 'string',
    })
    .option('p', {
      alias: 'port',
      default: 3000,
      describe: 'The listening port of the fake json-api server.',
      nArgs: 1,
      type: 'number',
    });
};

const createAsyncImportFunc = (filePath) => {
  const filePathURL = pathToFileURL(filePath);
  return async () => {
    // eslint-disable-next-line no-script-url
    return import(filePathURL);
  };
};

const defResolveResource = createAsyncImportFunc(resourceDef);

const resolveResourceDataPath = (dataPath, returnUnresolved = false) => {
  if (!dataPath) {
    return defResolveResource;
  }
  const normalDataPath = (typeof dataPath === 'string' ? dataPath : String(dataPath)).trim();
  try {
    const normalDataPathStats = fs.statSync(path.normalize(normalDataPath));
    if (normalDataPathStats.isDirectory()) {
      return createAsyncImportFunc([normalDataPath, dataNameDef].join('/'));
    }
    if (returnUnresolved || normalDataPathStats.isFile()) {
      return createAsyncImportFunc(normalDataPath);
    }
    return undefined;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.debug(`Unable to get stat of '${normalDataPath}'`, error.message);
  }
  return returnUnresolved ? createAsyncImportFunc(normalDataPath) : undefined;
};

const resolveImportCreateResources = (dataPath) => {
  const resourcePathLookup = [dataPath, [dataPathPrefix, dataPath].join('/'), [bookstoreDataPathDef, dataPath].join('/')];

  for (let index = 0; index < resourcePathLookup.length; index += 1) {
    const returnUnresolved = index === resourcePathLookup.length - 1;
    const resolveResource = resolveResourceDataPath(resourcePathLookup[index], returnUnresolved);
    if (resolveResource) {
      return resolveResource;
    }
  }
  return defResolveResource;
};

const handler = (argv) => {
  const importCreateResources = resolveImportCreateResources(argv.resourcePath);
  importCreateResources()
    .then((resolvedExports) => {
      const { default: fakeJsonApiServerOptions } = resolvedExports;
      fakeJsonApiServer({
        port: argv.port,
        ...(typeof fakeJsonApiServerOptions === 'function' ? fakeJsonApiServerOptions() : fakeJsonApiServerOptions),
      });
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Unable to load resource', error.message);
      process.exit(2);
    });
};

export { aliases, command, describe, builder, handler };
