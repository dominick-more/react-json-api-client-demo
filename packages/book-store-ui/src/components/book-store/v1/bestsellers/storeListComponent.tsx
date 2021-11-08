import { Exception as OrbitException, Listener } from '@orbit/core';
import { QueryBuilderFunc, Record as OrbitRecord, Transform } from '@orbit/data';
import { QueryResultData } from '@orbit/record-cache';
import _debounce from 'lodash/debounce';
import _merge from 'lodash/merge';
import logger from 'loglevel';
import React, { useEffect, useMemo, useReducer, useState } from 'react';
import useBookStoreOrbitJsContext from '~/contexts/book-store/v1/bookStoreOrbitJsContext';
import useOrbitJsHook, {
  PredicatedSourceInstructions,
  SourceChangeResult,
  TaskQueueProcessInstructions,
  TaskQueueRecoveryInstructions,
} from '~/hooks/orbit-js/orbitJsHook';
import bookStoreReducer, { bookStoreInitialState } from '~/reducers/book-store/v1/bookStoreReducer';
import { Author } from '~/types/book-store/v1/author';
import { Book } from '~/types/book-store/v1/book';
import { Country } from '~/types/book-store/v1/country';
import { Store } from '~/types/book-store/v1/store';
import { Undefinable } from '~/types/common/commonJs';
import { coerceAsArray, coerceAsDefault, coerceAsReadonlyObject } from '~/utils/common/transformers';
import { isBlankString, isNil, isPlainObject } from '~/utils/common/typeGuards';
import { coerceOrbitCatchReasonAsError, createSourceNamesPredicate, isNetworkError } from '~/utils/orbit-js/orbitJSUtils';
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

const regExpQueryOrPull = /^\s*(query|pull)\s*/i;

type RemoteFailSource = 'pullable' | 'pushable';
type QueryStrategy = 'cache' | 'sync';

const isSourceChanged = (results?: SourceChangeResult[]): boolean => {
  if (!Array.isArray(results) || !results.length) {
    return false;
  }
  return results.some((result) => result?.changed === true);
};

const StoreListComponent = (): React.ReactElement => {
  const [remoteFailSource, setRemoteFailSource] = useState<Undefinable<RemoteFailSource>>(undefined);
  const [pendingQueryStrategy, setPendingQueryStrategy] = useState<Undefinable<QueryStrategy>>('sync');

  const debouncedSetPendingQueryStrategy = useMemo(() => {
    const debounceWait = 20;
    return _debounce(
      (queryStrategy: Undefinable<QueryStrategy>) =>
        setPendingQueryStrategy((prevQueryStrategy) =>
          prevQueryStrategy !== queryStrategy ? queryStrategy : prevQueryStrategy
        ),
      debounceWait
    );
  }, []);

  // Trigger store query strategy 'cache' after successful non-blocking remote GET request (i.e. query).
  // Notifies data consumers which may need to query potentially changed cached local state.
  const OnUpdateSuccessListener = useMemo((): Listener => {
    return () => {
      const queryStrategy = 'cache';
      logger.debug(`Update success listener triggering setPendingQueryStrategy '${queryStrategy}'.`);
      setPendingQueryStrategy(queryStrategy);
    };
  }, []);

  // A remote GET request (i.e. query) is a pullable fail. Further attempts to query remote source
  // can be discarded and should be queried from the cache as long as the server is not reachable.
  const OnPullableFailListener = useMemo((): Listener => {
    return (_transform: Transform, exception: OrbitException) => {
      if (isNetworkError(exception)) {
        const failSource = 'pullable';
        logger.debug(`Pullable fail listener triggering setRemoteFailSource '${failSource}'.`);
        setRemoteFailSource(failSource);
      } else {
        logger.error(`Pullable fail listener event unhandled: '${coerceOrbitCatchReasonAsError(exception).message}'.`);
      }
    };
  }, []);

  // Trigger store query strategy 'cache' after successful non-blocking remote GET request (i.e. query).
  // Notifies data consumers which may need to query potentially changed cached local state.
  const OnPullableSuccessListener = useMemo((): Listener => {
    return () => {
      const queryStrategy = 'cache';
      logger.debug(`Pullable success listener triggering debouncedSetPendingQueryStrategy '${queryStrategy}'.`);
      debouncedSetPendingQueryStrategy(queryStrategy);
    };
  }, []);

  // A remote POST, UPDATE or DELETE request (i.e. update) is a pushable fail. This type of request
  // should be requeued at processed when the network is available again, otherwise local mutations
  // will not be synced with the remote source.
  const OnPushableFailListener = useMemo((): Listener => {
    return (_transform: Transform, exception: OrbitException) => {
      if (isNetworkError(exception)) {
        const failSource = 'pushable';
        logger.debug(`Pushable fail listener triggering setRemoteFailSource '${failSource}'.`);
        setRemoteFailSource(failSource);
      } else {
        logger.error(`Pushable fail listener event unhandled: '${coerceOrbitCatchReasonAsError(exception).message}'.`);
      }
    };
  }, []);

  // Trigger store query strategy 'cache' after successful non-blocking remote POST, UPDATE or
  // DELETE request (i.e. update).
  // Notifies data consumers which may need to query potentially changed cached local state.
  const OnPushableSuccessListener = useMemo((): Listener => {
    return () => {
      const queryStrategy = 'cache';
      logger.debug(`Pushable success listener triggering debouncedSetPendingQueryStrategy '${queryStrategy}'.`);
      debouncedSetPendingQueryStrategy(queryStrategy);
    };
  }, []);

  const {
    getSourceRequestQueueStatus,
    querySource,
    querySourceCache,
    processRequestQueue,
    recoverRequestQueue,
    setAutoProcess,
    updateSource,
  } = useOrbitJsHook({
    listeners: {
      updatable: {
        onSuccess: OnUpdateSuccessListener,
      },
      pullable: {
        onFail: OnPullableFailListener,
        onSuccess: OnPullableSuccessListener,
      },
      pushable: {
        onFail: OnPushableFailListener,
        onSuccess: OnPushableSuccessListener,
      },
    },
    useOrbitJsContext: useBookStoreOrbitJsContext,
  });

  const invokeProcessRequestRequeue = useMemo(() => {
    const debounceWait = 15000;
    const debouncedProcessRequestQueueStrategy = _debounce(
      (predicatedProcessInstructions: PredicatedSourceInstructions<TaskQueueProcessInstructions>): void => {
        logger.debug(`Processing requestQueue sources after ${debounceWait} milliseconds.`);
        processRequestQueue(predicatedProcessInstructions)
          .then((results) => {
            if (isSourceChanged(results)) {
              logger.debug(
                `Setting queryStrategy 'sync' after successful source requestQueue '${JSON.stringify(results)}' process.`
              );
              setPendingQueryStrategy('sync');
            } else {
              logger.debug(`No source requestQueue task queue changed.`);
            }
          })
          .catch(() => {
            logger.warn(`Processing requestQueue sources failed.`);
          });
      },
      debounceWait,
      { trailing: true }
    );
    return (params?: {
      predicatedProcessInstructions: PredicatedSourceInstructions<TaskQueueProcessInstructions>;
      predicatedRecoveryInstructions?: PredicatedSourceInstructions<TaskQueueRecoveryInstructions>;
    }): (() => void) => {
      if (isNil(params)) {
        logger.debug('No ProcessRequestRequeue params defined. Doing nothing.');
      } else if (!isNil(params.predicatedRecoveryInstructions)) {
        const recoveryStrategy = params.predicatedRecoveryInstructions.instructions?.strategy;
        logger.debug(`Recovering source requestQueue current task: '${recoveryStrategy}'.`);
        recoverRequestQueue(params.predicatedRecoveryInstructions).then((results) => {
          logger.debug(`Invoking debounced source requestQueue process: '${JSON.stringify(results)}'.`);
          debouncedProcessRequestQueueStrategy(params.predicatedProcessInstructions);
        });
      } else {
        debouncedProcessRequestQueueStrategy(params.predicatedProcessInstructions);
      }
      return (): void => {
        logger.debug('Flushing debounced processQueueStrategy.');
        debouncedProcessRequestQueueStrategy.flush();
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
            qb
              .findRelatedRecords(storeRecord, 'books')
              .sort({ attribute: 'copiesSold', order: 'descending' })
              .page({ offset: 0, limit: 2 })
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
    if (!remoteFailSource) {
      return;
    }
    setRemoteFailSource(undefined);
    const remoteQueueStatus = getSourceRequestQueueStatus('remote');
    if (!remoteQueueStatus.hasError) {
      // If remoteQueue does not contain an error return.
      return;
    }
    const predicatedProcessInstructions: PredicatedSourceInstructions<TaskQueueProcessInstructions> = {
      predicate: createSourceNamesPredicate('remote'),
      instructions: {
        autoProcessControl: (status): boolean => {
          return status === 'success';
        },
      },
    };
    const strategy = regExpQueryOrPull.test(coerceAsDefault(remoteQueueStatus.taskType, '')) ? 'shift' : 'requeue';
    const predicatedRecoveryInstructions: PredicatedSourceInstructions<TaskQueueRecoveryInstructions> = {
      predicate: createSourceNamesPredicate('remote'),
      instructions: {
        autoProcessControl: (): boolean => {
          return false;
        },
        strategy,
      },
    };
    invokeProcessRequestRequeue({ predicatedProcessInstructions, predicatedRecoveryInstructions });
  }, [getSourceRequestQueueStatus, invokeProcessRequestRequeue, remoteFailSource]);

  // Execute orbit record to Store mapping on initial load and update
  useEffect((): void => {
    if (!pendingQueryStrategy) {
      return;
    }
    setPendingQueryStrategy(undefined);
    bookStoreActionDispatch({ type: 'load' });
    const promise = ((): Promise<QueryResultData> => {
      const qbf: QueryBuilderFunc = (qb) => qb.findRecords('stores');
      const memoryRequestQueueStatus = getSourceRequestQueueStatus('memory');
      if (!memoryRequestQueueStatus.hasError && pendingQueryStrategy === 'sync') {
        logger.debug('Loading bookStore source with sync.');
        // Must be able to reactivate autoProcess to ensure synchronisation
        // the next query execution will depend on the remote response. If
        // stale data is not an issue you can safely call querySourceCache
        // to query the potentially unsynchronized mutable cached data set.
        const predicatedInstructions: PredicatedSourceInstructions<Required<TaskQueueProcessInstructions>> = {
          predicate: createSourceNamesPredicate('memory', 'remote'),
          instructions: {
            autoProcessControl: (status): boolean => {
              return status === 'success';
            },
          },
        };
        setAutoProcess(predicatedInstructions);
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
        logger.error(
          `Unhandled bookStore query error. Async pullable errors should be handled in OnPullableFailListener${
            coerceOrbitCatchReasonAsError(error).message
          }`
        );
        bookStoreActionDispatch({
          type: 'complete',
          payload: {
            error: coerceOrbitCatchReasonAsError(error),
          },
        });
      });
  }, [getSourceRequestQueueStatus, pendingQueryStrategy, setAutoProcess, storeMapper]);

  // Cancel invokeRecoverRequestQueue on unmount
  useEffect(() => {
    const cancelInvokeRecoverProcessRequestQueue = (): void => {
      debouncedSetPendingQueryStrategy.cancel();
      invokeProcessRequestRequeue()();
    };
    return () => cancelInvokeRecoverProcessRequestQueue();
  }, [invokeProcessRequestRequeue, debouncedSetPendingQueryStrategy]);

  // Memoize ClickRatingHandler handler
  const onClickRating: ClickRatingHandler = useMemo((): ClickRatingHandler => {
    return (storeId, ratingValue): void => {
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
      updateSource(_merge({ ...storeRecord }, { attributes: { rating: effectiveRating } }))
        .then(() => {
          logger.debug('Successfully completed bookStore source update.');
        })
        .catch((error) => {
          logger.error(
            `Unhandled bookStore source update. Async remote errors should be handled in OnPushableableFailListener${
              coerceOrbitCatchReasonAsError(error).message
            }`
          );
          bookStoreActionDispatch({
            type: 'complete',
            payload: {
              error: coerceOrbitCatchReasonAsError(error),
            },
          });
        });
    };
  }, [querySourceCache, updateSource]);

  // Reload bookstores on demand
  const onClickReloadBookstores = useMemo((): React.MouseEventHandler<HTMLButtonElement> => {
    return (): void => {
      setPendingQueryStrategy('sync');
    };
  }, []);

  const storeComponents = bookStoreState.data.map((store: Store): React.ReactElement => {
    return <StoreComponent data={store} key={store.id} onClickRating={onClickRating} />;
  });

  return (
    <section className="bestsellers-store-section">
      <div className="bestsellers-store-section-header">
        <h1>Bookstores</h1>
        <span>
          <button
            aria-label="Reload stores"
            disabled={!isBlankString(pendingQueryStrategy)}
            type="button"
            onClick={onClickReloadBookstores}
          >
            Reload stores
          </button>
        </span>
      </div>
      <div className="bestsellers-store-list">
        {storeComponents.length ? storeComponents : <div className="bestsellers-store-list-empty">No data available</div>}
      </div>
    </section>
  );
};

export default StoreListComponent;
