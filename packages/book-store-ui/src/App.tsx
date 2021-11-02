import React, { useEffect } from 'react';
import logger from 'loglevel';
import StoreListComponent from '~/components/book-store/v1/bestsellers/storeListComponent';
import schema from '~/data-sources/json-api/book-store/v1/schema/bookStoreSchema';
import OrbitJsProvider, { OrbitJsProviderParams } from '~/providers/orbit-js/orbitJSProvider';
import { BookStoreOrbitJsContext } from './contexts/book-store/v1/bookStoreOrbitJsContext';

const providerProps: OrbitJsProviderParams = Object.freeze({
  jsonApiSource: Object.freeze({
    schema,
    jsonApiSource: Object.freeze({
      host: window?.location?.origin,
      namespace: 'json-api/book-store/v1',
    }),
  }),
  context: BookStoreOrbitJsContext,
});

const App = (): React.ReactElement => {
  useEffect(() => {
    logger.setLevel('debug');
  }, []);
  return (
    <OrbitJsProvider context={providerProps.context} jsonApiSource={providerProps.jsonApiSource}>
      <StoreListComponent />
    </OrbitJsProvider>
  );
};

export default App;
