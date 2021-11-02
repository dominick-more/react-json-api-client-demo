import { Exception as OrbitException, Listener } from '@orbit/core';
import { QueryBuilderFunc, Record as OrbitRecord, Transform } from '@orbit/data';
import { QueryResultData } from '@orbit/record-cache';
import _debounce from 'lodash/debounce';
import _merge from 'lodash/merge';
import logger from 'loglevel';
import React, { useEffect, useMemo, useReducer, useState } from 'react';
import useBookStoreOrbitJsContext from '~/contexts/book-store/v1/bookStoreOrbitJsContext';
import useOrbitJsHook, { TaskQueueRecoveryStrategy } from '~/hooks/orbit-js/orbitJsHook';
import bookStoreReducer, { bookStoreInitialState } from '~/reducers/book-store/v1/bookStoreReducer';
import { Author } from '~/types/book-store/v1/author';
import { Book } from '~/types/book-store/v1/book';
import { Country } from '~/types/book-store/v1/country';
import { Store } from '~/types/book-store/v1/store';
import { Undefinable, ValueOf } from '~/types/common/commonJs';
import { OrbitJsSourceNames } from '~/types/orbit-js/orbitJsContextValue';
import { coerceAsArray, coerceAsReadonlyObject } from '~/utils/common/transformers';
import { isError, isNil, isPlainObject } from '~/utils/common/typeGuards';
import { isOrbitException } from '~/utils/orbit-js/orbitJSUtils';
import StoreComponent from './storeComponent';
import './storeListComponent.css';
import { ClickRatingHandler, normalizeRating } from './storeRatingComponent';

const defaultAuthor: Author = {
  type: 'authors',
  id: '',
  fullName: '',
};

const defaultBook: Book = {
  type: 'books',
  id: '',
  name: '',
  copiesSold: 0,
  author: undefined,
};

const defaultCountry: Country = {
  type: 'countries',
  id: '',
  code: '',
};

const defaultStore: Store = {
  type: 'stores',
  id: '',
  name: '',
  storeImage: '',
  establishmentDate: '1970-01-01T00:00:00.000Z',
  website: '',
  rating: 0,
  country: undefined,
  books: [],
};

type PushRecoveryStrategy = 'retry';
type QueryStrategy = 'cache' | 'sync';

const isNetworkError = (error: any): boolean => {
  const maybeError = isOrbitException(error) ? error.error : error;
  return isError(maybeError) && /\s*Network\s*error\s*:.*/i.test(maybeError.message);
};

const StoreListComponent = (): React.ReactElement => {
  const [pushRecoveryStrategy, setPushRecoveryStrategy] = useState<Undefinable<PushRecoveryStrategy>>(undefined);
  const [queryStrategy, setQueryStrategy] = useState<Undefinable<QueryStrategy>>('sync');

  // Trigger store mapping query after update.
  const OnUpdateSuccessListener = useMemo((): Listener => {
    return () => {
      logger.debug('Triggering bookStore source query with cache.');
      setQueryStrategy('cache');
    };
  }, []);

  // Trigger store pushable recovery strategy 'retry' on network error.
  const OnPushableFailListener = useMemo((): Listener => {
    return (_transform: Transform, exception: OrbitException) => {
      if (isNetworkError(exception)) {
        logger.debug("Triggering bookStore pushable recovery strategy 'retry'.");
        setPushRecoveryStrategy('retry');
      }
    };
  }, []);

  const { querySource, querySourceCache, updateSource, processRequestQueue, recoverRequestQueue } = useOrbitJsHook({
    listeners: {
      updatable: {
        onSuccess: OnUpdateSuccessListener,
      },
      pushable: {
        onFail: OnPushableFailListener,
      },
    },
    useOrbitJsContext: useBookStoreOrbitJsContext,
  });

  const invokeRecoverRequestQueue = useMemo(() => {
    const debounceWait = 15000;
    const debouncedSetQueryStrategySync = _debounce(
      (strategy: Undefinable<QueryStrategy>): void => {
        logger.debug(`Setting queryStrategy '${strategy}' after ${debounceWait} milliseconds.`);
        setQueryStrategy(strategy);
      },
      debounceWait,
      { trailing: true }
    );
    return (recoveryStrategy?: TaskQueueRecoveryStrategy, strategy?: QueryStrategy): (() => void) => {
      if (isNil(recoveryStrategy)) {
        logger.debug('No recoverRequestQueue recoveryStrategy defined. Doing nothing.');
      } else {
        logger.debug(`Invoking recoverRequestQueue with recoveryStrategy '${recoveryStrategy}'.`);
        recoverRequestQueue(recoveryStrategy).then(() => {
          logger.debug(`Invoking debounced setQueryStrategy '${strategy}'.`);
          debouncedSetQueryStrategySync(strategy);
        });
      }
      return (): void => {
        debouncedSetQueryStrategySync.cancel();
      };
    };
  }, [recoverRequestQueue]);

  const invokeProcessRequestRequeue = useMemo(() => {
    const debounceWait = 15000;
    const debouncedProcessQueueStrategySync = _debounce(
      (sourceNames?: Readonly<ValueOf<OrbitJsSourceNames>[]>): void => {
        logger.debug(`Processing requestQueue '${String(sourceNames)}' source after ${debounceWait} milliseconds.`);
        processRequestQueue(sourceNames)
          .then(() => {
            logger.debug(
              `Setting queryStrategy 'sync' after successful requestQueue '${String(sourceNames)}' source process.`
            );
            setQueryStrategy('sync');
          })
          .catch(() => {
            logger.warn(`Processing requestQueue '${String(sourceNames)}' source failed.`);
          });
      },
      debounceWait,
      { trailing: true }
    );
    return (sourceNames?: Readonly<ValueOf<OrbitJsSourceNames>[]>): (() => void) => {
      if (isNil(sourceNames) || !sourceNames.length) {
        logger.debug('No requestQueue source defined. Doing nothing.');
      } else {
        logger.debug(`Requeueing requestQueue '${String(sourceNames)}' source current task.`);
        recoverRequestQueue('requeue', sourceNames).then(() => {
          logger.debug(`Invoking debounced requestQueue '${String(sourceNames)}' source process.`);
          debouncedProcessQueueStrategySync(sourceNames);
        });
      }
      return (): void => {
        debouncedProcessQueueStrategySync.cancel();
      };
    };
  }, [processRequestQueue, recoverRequestQueue]);

  const [bookStoreState, bookStoreActionDispatch] = useReducer(bookStoreReducer, bookStoreInitialState);

  // Map orbit record to Store
  const storeMapper = useMemo(() => {
    return (storeRecord: OrbitRecord): Store => {
      const { relationships } = storeRecord;
      const store: Store = _merge({ ...defaultStore }, coerceAsReadonlyObject(storeRecord.attributes), {
        id: storeRecord.id,
      });

      if (!isPlainObject(relationships) || !Object.getOwnPropertyNames(relationships).length) {
        return store;
      }
      if (isPlainObject(relationships.books) && Array.isArray(relationships.books.data)) {
        const bookRecords = coerceAsArray(
          querySourceCache((qb) =>
            qb.findRelatedRecords(storeRecord, 'books').sort({ attribute: 'copiesSold', order: 'descending' })
          )
        );
        store.books = bookRecords
          .map((bookRecord): Book | undefined => {
            const book: Book = _merge({ ...defaultBook }, coerceAsReadonlyObject(bookRecord.attributes), {
              id: bookRecord.id,
            });
            const authorRecord = querySourceCache((qb) => qb.findRelatedRecord(bookRecord, 'author'));
            if (!isNil(authorRecord) && !Array.isArray(authorRecord)) {
              const author: Author = _merge({ ...defaultAuthor }, coerceAsReadonlyObject(authorRecord.attributes), {
                id: authorRecord.id,
              });
              book.author = author;
            }
            return book;
          })
          .filter((book: Undefinable<Book>): book is Book => !isNil(book));
      }
      if (isPlainObject(relationships.country) && isPlainObject(relationships.country.data)) {
        const countryRecord = querySourceCache((qb) => qb.findRelatedRecord(storeRecord, 'country'));
        if (!isNil(countryRecord) && !Array.isArray(countryRecord)) {
          const country: Country = _merge({ ...defaultCountry }, coerceAsReadonlyObject(countryRecord.attributes), {
            id: countryRecord.id,
          });
          store.country = country;
        }
      }
      return store;
    };
  }, [querySourceCache]);

  useEffect((): void => {
    if (!pushRecoveryStrategy) {
      return;
    }
    setPushRecoveryStrategy(undefined);
    invokeProcessRequestRequeue(['remote']);
  }, [invokeProcessRequestRequeue, pushRecoveryStrategy, setPushRecoveryStrategy]);

  // Execute orbit record to Store mapping on initial load and update
  useEffect((): void => {
    if (!queryStrategy) {
      return;
    }
    setQueryStrategy(undefined);
    bookStoreActionDispatch({ type: 'load' });
    const promise = ((): Promise<QueryResultData> => {
      const qbf: QueryBuilderFunc = (qb) => qb.findRecords('stores');
      if (queryStrategy === 'sync') {
        logger.debug('Loading bookStore source with sync.');
        return querySource(qbf);
      }
      logger.debug('Loading bookStore source with cache.');
      return Promise.resolve(querySourceCache(qbf));
    })();
    promise
      .then((resultData) => {
        logger.debug('Beginning bookStore source mapping.');
        const storeRecords = coerceAsArray(resultData);
        const data: Store[] = storeRecords.map(storeMapper);
        logger.debug('Successfully completed bookStore source mapping.');
        bookStoreActionDispatch({
          type: 'complete',
          payload: {
            data,
          },
        });
      })
      .catch((error) => {
        if (isNetworkError(error)) {
          logger.warn('Unsuccessfully completed bookStore source mapping with network error. Clearing queue.');
          invokeRecoverRequestQueue('clear', 'sync');
        } else {
          logger.warn('Unhandled bookStore source mapping error.', error);
        }
        bookStoreActionDispatch({
          type: 'complete',
          payload: {
            error,
          },
        });
      });
  }, [invokeRecoverRequestQueue, queryStrategy, storeMapper]);

  // Cancel invokeRecoverRequestQueue on unmount
  useEffect(() => {
    const cancelInvokeRecoverRequestQueue = (): void => {
      invokeRecoverRequestQueue()();
    };
    return () => cancelInvokeRecoverRequestQueue();
  }, [invokeRecoverRequestQueue]);

  // Memoize ClickRatingHandler handler
  const onClickRating: ClickRatingHandler = useMemo((): ClickRatingHandler => {
    return (storeId, ratingValue) => {
      logger.debug(`Clicked store id ${storeId} rating value ${ratingValue}.`);
      const storeRecord = querySourceCache((qb) => qb.findRecord({ id: storeId, type: 'stores' }));
      if (isNil(storeRecord) || Array.isArray(storeRecord)) {
        return;
      }
      const normalizedRating = normalizeRating(ratingValue);
      const effectiveRating =
        storeRecord.attributes?.rating === normalizedRating && normalizedRating >= 1
          ? normalizedRating - 1
          : normalizedRating;
      logger.debug('Beginning bookStore source update.');
      updateSource(
        _merge({ ...storeRecord, attributes: { ...storeRecord.attributes } }, { attributes: { rating: effectiveRating } })
      )
        .then(() => {
          logger.debug('Successfully completed bookStore source update.');
        })
        .catch((error) => {
          if (isNetworkError(error)) {
            logger.warn('Unsuccessfully completed bookStore source update with network error. Clearing queue.');
            invokeRecoverRequestQueue('clear', 'sync');
          } else {
            logger.warn('Unhandled update source error.', error);
          }
          bookStoreActionDispatch({
            type: 'complete',
            payload: {
              error,
            },
          });
        });
    };
  }, [invokeRecoverRequestQueue, querySourceCache, storeMapper, updateSource]);

  const storeComponents = bookStoreState.data.map((store: Store): React.ReactElement => {
    return <StoreComponent data={store} key={store.id} onClickRating={onClickRating} />;
  });

  return (
    <section className="bestsellers-store-section">
      <h1>Bookstores</h1>
      <div className="bestsellers-store-list">
        {storeComponents.length ? storeComponents : <div className="bestsellers-store-list-empty">No data available</div>}
      </div>
    </section>
  );
};

export default StoreListComponent;
