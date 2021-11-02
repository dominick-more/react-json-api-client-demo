import { Listener } from '@orbit/core';
import { QueryBuilderFunc, Record as OrbitRecord, Source, UpdateRecordOperation } from '@orbit/data';
import { QueryResultData } from '@orbit/record-cache';
import logger from 'loglevel';
import { useEffect, useMemo } from 'react';
import { Undefinable, ValueOf } from '~/types/common/commonJs';
import { OrbitJsContextValue, OrbitJsSourceNames } from '~/types/orbit-js/orbitJsContextValue';
import { coerceAsReadonlyArray, coerceAsReadonlyObject } from '~/utils/common/transformers';
import { arrayIncludesValue, isNil } from '~/utils/common/typeGuards';

type TaskQueueRecoveryStrategy = 'clear' | 'retry' | 'skip' | 'requeue';

type OrbitJsHookResult = {
  querySource: (queryBuilder: QueryBuilderFunc, options?: Record<string, any>) => Promise<QueryResultData | never>;
  querySourceCache: (queryBuilder: QueryBuilderFunc, options?: Record<string, any>) => QueryResultData | never;
  processRequestQueue: (sourceNames?: Readonly<ValueOf<OrbitJsSourceNames>[]>) => Promise<void | never>;
  updateSource: (record: OrbitRecord) => Promise<void | never>;
  recoverRequestQueue: (
    strategy: TaskQueueRecoveryStrategy,
    sourceNames?: Readonly<ValueOf<OrbitJsSourceNames>[]>
  ) => Promise<void | never>;
};

type OrbitJsHookParams = {
  listeners?: {
    pushable?: {
      onSuccess?: Listener;
      onFail?: Listener;
    };
    updatable?: {
      onSuccess?: Listener;
      onFail?: Listener;
    };
    syncable?: {
      onSuccess?: Listener;
      onFail?: Listener;
    };
  };
  useOrbitJsContext: () => Undefinable<OrbitJsContextValue>;
};

const isPromiseRejectedResult = (value: PromiseSettledResult<any>): value is PromiseRejectedResult =>
  value.status === 'rejected';

const createRegisterListenerCallback = (sourceEvent: string, source?: Source, listener?: Listener): (() => void) => {
  if (!source) {
    throw new Error('source not defined.');
  }
  if (listener && !coerceAsReadonlyArray(source.listeners(sourceEvent))?.includes(listener)) {
    logger.debug(`Registering source '${source.name}' event '${sourceEvent}' Listener...`);
    source.on(sourceEvent, listener);
  }
  const removeListener = (): void => {
    if (listener && coerceAsReadonlyArray(source.listeners(sourceEvent))?.includes(listener)) {
      logger.debug(`De-registering source '${source.name}' event '${sourceEvent}' Listener...`);
      source.off(sourceEvent, listener);
    }
  };
  return (): void => removeListener();
};

const createSourceRequestQueueProcessPromise = (
  source: Source,
  sourceName: ValueOf<OrbitJsSourceNames>,
  matchingSourceNames?: Readonly<ValueOf<OrbitJsSourceNames>[]>,
  toggleAutoProcessOnPromise: boolean = true
): Promise<void> => {
  return arrayIncludesValue(sourceName, matchingSourceNames)
    ? new Promise<void>((resolveProcess, rejectProcess) => {
        source.requestQueue
          .process()
          .then(() => {
            /**
             * If processing was successful, the queue is expected to be empty otherwise an exception is expected.
             */
            if (source.requestQueue.empty) {
              if (toggleAutoProcessOnPromise && !source.requestQueue.autoProcess) {
                logger.debug(`Re-enabling '${sourceName}' requestQueue 'autoProcess' after successful process.`);
                /* eslint-disable-next-line no-param-reassign */
                source.requestQueue.autoProcess = true;
              }
              resolveProcess();
            } else {
              rejectProcess(new Error(`'${sourceName}' requestQueue is not empty after process.`));
            }
          })
          .catch((error: any) => {
            logger.debug(`Catching '${sourceName}' requestQueue process error.`);
            if (toggleAutoProcessOnPromise && source.requestQueue.autoProcess) {
              logger.debug(`Disabling '${sourceName}' requestQueue 'autoProcess' after unsuccessful process.`);
              /* eslint-disable-next-line no-param-reassign */
              source.requestQueue.autoProcess = false;
            }
            rejectProcess(error);
          });
      })
    : Promise.resolve();
};

const createSourceRequestQueueExecPromise = (
  source: Source,
  sourceName: ValueOf<OrbitJsSourceNames>,
  strategy: Exclude<TaskQueueRecoveryStrategy, 'requeue'>,
  matchingSourceNames?: Readonly<ValueOf<OrbitJsSourceNames>[]>
): Promise<void> => {
  return arrayIncludesValue(sourceName, matchingSourceNames)
    ? new Promise<void>((resolveProcess) => {
        source.requestQueue[strategy]()
          .catch(() => {
            // If the task queue processing resulted in an error being thrown
            // that error will be rethrown here when the error is purged. This is to be
            // expected and required to successfully perform one of specified the task queue functions.
            logger.debug(`Catching '${strategy}' '${sourceName}' requestQueue error.`);
          })
          .finally(() => {
            resolveProcess();
          });
      })
    : Promise.resolve();
};

/**
 * A reusable source.requestQueue Task reschedule Promise factory.
 *
 * @param source  - An instance extending Source
 * @param sourceName - A source name as identified in the coordinator source map.
 * @param matchingSourceNames - A list of source names in which sourceName must be included. If not then a noop resolved promise is returned.
 * @param autoProcess - Indicates a state that autoProcess should be set to before attempting to
 * @returns
 */
const createSourceRequestQueueTaskReschedulePromise = (
  source: Source,
  sourceName: ValueOf<OrbitJsSourceNames>,
  matchingSourceNames?: Readonly<ValueOf<OrbitJsSourceNames>[]>,
  autoProcess?: boolean
): Promise<void> => {
  return arrayIncludesValue(sourceName, matchingSourceNames)
    ? new Promise<void>((resolve) => {
        if (!isNil(autoProcess) && source.requestQueue.autoProcess !== autoProcess) {
          logger.debug(`Setting '${sourceName}' requestQueue 'autoProcess' to ${autoProcess}.`);
          /* eslint-disable-next-line no-param-reassign */
          source.requestQueue.autoProcess = autoProcess;
        }
        /**
         * Removing the queue head task which is the only one which should contain an error
         * and then requeuing it at the head position again for rescheduling.
         * If source.requestQueue.autoProcess is true, the requestQueue.process function is
         * called immediately after the task queue is altered. This is a design feature of the
         * orbitJS TaskQueue.
         */
        source.requestQueue
          .shift()
          .then((currentTask) => {
            source.requestQueue.unshift(currentTask).catch(() => {
              // A task queue should not throw an error while unshifting after having
              // successfully. Due to the asynchronous nature, it could be possible for
              // a small time slice between successfully shifting and unshifting to
              // change the state of the requestQueue between promise resolutions.
              logger.debug(`Catching '${sourceName}' requestQueue 'unshift' error.`);
            });
          })
          .catch(() => {
            // If the task queue processing resulted in an error being thrown
            // that error will be rethrown here when the task is shifted off the queue.
            // This is to be expected.
            logger.debug(`Catching '${sourceName}' requestQueue 'shift' error.`);
          })
          .finally(() => {
            resolve();
          });
      })
    : Promise.resolve();
};

const settleAllVoidPromises = (
  resolve: (value: void | PromiseLike<void>) => void,
  reject: (reason?: any) => void,
  ...promises: Promise<void>[]
): void => {
  if (!promises.length) {
    throw new TypeError('promises argument must contain at least one item.');
  }
  Promise.allSettled(promises)
    .then((values: PromiseSettledResult<void>[]) => {
      const rejected: Undefinable<PromiseRejectedResult> = values.find(isPromiseRejectedResult);
      if (rejected) {
        reject(rejected.reason);
      } else {
        resolve();
      }
    })
    .catch((error: any) => {
      reject(error);
    });
};

const useOrbitJsHook = (params: OrbitJsHookParams): OrbitJsHookResult => {
  const { listeners, useOrbitJsContext } = params;
  const { onSuccess: onPushSuccess, onFail: onPushFail } = coerceAsReadonlyObject(listeners?.pushable);
  const { onSuccess: onUpdateSuccess, onFail: onUpdateFail } = coerceAsReadonlyObject(listeners?.updatable);
  const { onSuccess: onSyncSuccess, onFail: onSyncFail } = coerceAsReadonlyObject(listeners?.syncable);

  // Context value should never change as long as provider is mounted.
  const { sources } = coerceAsReadonlyObject(useOrbitJsContext());
  const { memory, remote } = coerceAsReadonlyObject(sources);

  useEffect((): (() => void) => {
    // JSONAPISource implements the Pushable interface
    return createRegisterListenerCallback('pushFail', remote, onPushFail);
  }, [remote, onPushFail]);

  useEffect((): (() => void) => {
    // JSONAPISource implements the Pushable interface
    return createRegisterListenerCallback('push', remote, onPushSuccess);
  }, [remote, onPushSuccess]);

  // Register/Deregister optional source error listener (i.e. to trigger retry)
  useEffect((): (() => void) => {
    // MemorySource implements the Updatable interface
    return createRegisterListenerCallback('updateFail', memory, onUpdateFail);
  }, [memory, onUpdateFail]);

  // Register/Deregister optional update complete listener (i.e. to trigger reducer)
  useEffect((): (() => void) => {
    // MemorySource implements the Updatable interface
    return createRegisterListenerCallback('update', memory, onUpdateSuccess);
  }, [memory, onUpdateSuccess]);

  // Register/Deregister optional source error listener (i.e. to trigger retry)
  useEffect((): (() => void) => {
    // MemorySource implements the Updatable interface
    return createRegisterListenerCallback('updateFail', memory, onUpdateFail);
  }, [memory, onUpdateFail]);

  // Register/Deregister optional update complete listener (i.e. to trigger reducer)
  useEffect(() => {
    // MemorySource implements the Syncable interface
    return createRegisterListenerCallback('sync', memory, onSyncSuccess);
  }, [memory, onSyncSuccess]);

  // Register/Deregister optional sync error listener (i.e. when pull/push fails)
  useEffect(() => {
    // MemorySource implements the Syncable interface
    return createRegisterListenerCallback('syncFail', memory, onSyncFail);
  }, [memory, onSyncFail]);

  // Memoize querySource closure
  const querySource = useMemo(() => {
    return (queryBuilder: QueryBuilderFunc, options?: Record<string, any>): Promise<QueryResultData | never> => {
      if (!memory) {
        throw new Error('memorySource not defined in Context.');
      }
      return memory.query(queryBuilder, options);
    };
  }, [memory]);

  // Memoize querySourceCache closure
  const querySourceCache = useMemo(() => {
    return (queryBuilder: QueryBuilderFunc, options?: Record<string, any>): QueryResultData => {
      if (!memory) {
        throw new Error('memorySource not defined in Context.');
      }
      return memory.cache.query(queryBuilder, options);
    };
  }, [memory]);

  // Memoize updateSource closure
  const updateSource = useMemo(() => {
    return async (record: OrbitRecord): Promise<void | never> => {
      if (!memory) {
        throw new Error('memorySource not defined in Context.');
      }
      return memory.update((t): UpdateRecordOperation => {
        return t.updateRecord(record);
      });
    };
  }, [memory]);

  // Memoize processRequestQueue closure
  const processRequestQueue = useMemo(() => {
    return async (sourceNames?: Readonly<ValueOf<OrbitJsSourceNames>[]>): Promise<void | never> => {
      if (!memory) {
        throw new Error('memorySource not defined in Context.');
      }
      if (!remote) {
        throw new Error('remoteSource not defined in Context.');
      }
      return new Promise<void>((resolve, reject): void => {
        /**
         * Create combined remote/memory source requestQueue process promise, the order is intented to only
         * process the memory requestQueue if the remote requestQueue is successfully processed.
         */
        const remotePromise = createSourceRequestQueueProcessPromise(remote, OrbitJsSourceNames.remote, sourceNames);
        const memoryPromise = createSourceRequestQueueProcessPromise(memory, OrbitJsSourceNames.memory, sourceNames);
        settleAllVoidPromises(resolve, reject, remotePromise, memoryPromise);
      });
    };
  }, [memory, remote]);

  // Memoize recoverRequestQueue closure
  const recoverRequestQueue = useMemo(() => {
    return (
      strategy: TaskQueueRecoveryStrategy,
      sourceNames?: Readonly<ValueOf<OrbitJsSourceNames>[]>
    ): Promise<void | never> => {
      if (!memory) {
        throw new Error('memorySource not defined in Context.');
      }
      if (!remote) {
        throw new Error('remoteSource not defined in Context.');
      }
      switch (strategy) {
        case 'clear':
        case 'retry':
        case 'skip':
          return new Promise<void>((resolve, reject) => {
            /**
             * Create combined remote/memory source requestQueue execution promise, the order is intented to only
             * execute the memory requestQueue if the remote requestQueue is successfully executed.
             */
            const remotePromise = createSourceRequestQueueExecPromise(
              remote,
              OrbitJsSourceNames.remote,
              strategy,
              sourceNames
            );
            const memoryPromise = createSourceRequestQueueExecPromise(
              memory,
              OrbitJsSourceNames.memory,
              strategy,
              sourceNames
            );
            settleAllVoidPromises(resolve, reject, remotePromise, memoryPromise);
          });
        case 'requeue':
          return new Promise<void>((resolve, reject) => {
            /**
             * Create combined remote/memory source requestQueue task requeue promise, the order is intented to only
             * execute the memory requestQueue if the remote requestQueue is successfully executed.
             */
            const remotePromise = createSourceRequestQueueTaskReschedulePromise(
              remote,
              OrbitJsSourceNames.remote,
              sourceNames,
              false
            );
            const memoryPromise = createSourceRequestQueueTaskReschedulePromise(
              memory,
              OrbitJsSourceNames.memory,
              sourceNames,
              false
            );
            settleAllVoidPromises(resolve, reject, remotePromise, memoryPromise);
          });
        default:
          return Promise.reject(
            new TypeError(`Unknown requestQueue recovery strategy requested: '${strategy}'. Doing nothing.`)
          );
      }
    };
  }, [memory, remote]);

  return { querySource, querySourceCache, processRequestQueue, updateSource, recoverRequestQueue };
};

export default useOrbitJsHook;

export type { OrbitJsHookParams, OrbitJsHookResult, TaskQueueRecoveryStrategy };
