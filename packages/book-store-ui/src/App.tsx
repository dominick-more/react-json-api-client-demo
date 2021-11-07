import React, { useEffect, useMemo, useState } from 'react';
import logger from 'loglevel';
import StoreListComponent from '~/components/book-store/v1/bestsellers/storeListComponent';
import schema from '~/data-sources/json-api/book-store/v1/schema/bookStoreSchema';
import OrbitJsProvider, { OrbitJsProviderParams } from '~/providers/orbit-js/orbitJSProvider';
import { BookStoreOrbitJsContext } from './contexts/book-store/v1/bookStoreOrbitJsContext';
import './App.css';

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
  const [mountStoreList, setMountStoreList] = useState<boolean>(true);

  useEffect(() => {
    logger.setLevel('debug');
  }, []);

  // Reload bookstores on demand
  const onClickToggleStoreListMount = useMemo((): React.MouseEventHandler<HTMLButtonElement> => {
    return (): void => {
      setMountStoreList(!mountStoreList);
    };
  }, [mountStoreList]);

  return (
    <div className="app-container">
      <div className="app-mount-toggle">
        <span>
          <button aria-label="Mount/Unmount Store List" type="button" onClick={onClickToggleStoreListMount}>
            {`${mountStoreList ? 'Unmount' : 'Mount'} store list`}
          </button>
        </span>
      </div>
      <div className="app-provider-container">
        {mountStoreList && (
          <OrbitJsProvider context={providerProps.context} jsonApiSource={providerProps.jsonApiSource}>
            <StoreListComponent />
          </OrbitJsProvider>
        )}
      </div>
    </div>
  );
};

export default App;
