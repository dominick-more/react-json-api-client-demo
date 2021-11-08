import { Listener, Task } from '@orbit/core';
import { QueryBuilderFunc, Record as OrbitRecord, Source, UpdateRecordOperation } from '@orbit/data';
import { QueryResultData } from '@orbit/record-cache';
import logger from 'loglevel';
import { useEffect, useMemo } from 'react';
import { Predicate, Undefinable, ValueOf } from '~/types/common/commonJs';
import { OrbitJsContextValue, OrbitJsSourceNames } from '~/types/orbit-js/orbitJsContextValue';
import { coerceAsReadonlyArray, coerceAsReadonlyObject } from '~/utils/common/transformers';
import { isNil } from '~/utils/common/typeGuards';
import { sourceRequestQueueHasErrorPredicate } from '~/utils/orbit-js/orbitJSUtils';

/**
 * If predicate source matcher to determine if instructions are applied, otherwise instructions are ignored.
 */
export type PredicatedSourceInstructions<I> = {
  predicate: (source: Source) => boolean;
  instructions: I;
};

export type TaskQueueAutoProcessControl = (
  status: 'success' | 'fail',
  sourceName: string,
  prevAutoProcess: boolean
) => boolean;

export type TaskQueueProcessInstructions = {
  autoProcessControl?: TaskQueueAutoProcessControl;
};

export type TaskQueueRecoveryStrategy = 'clear' | 'retry' | 'skip' | 'requeue' | 'shift';

export type TaskQueueRecoveryInstructions = {
  strategy: TaskQueueRecoveryStrategy;
} & TaskQueueProcessInstructions;

export type SourceChangeResult = {
  sourceName: ValueOf<OrbitJsSourceNames>;
  changed: boolean;
};

export type SourceRequestQueueStatus = {
  sourceName: ValueOf<OrbitJsSourceNames>;
  autoProcess: boolean;
  hasError: boolean;
  taskType?: string;
};

export type OrbitJsHookResult = {
  getSourceRequestQueueStatus: (sourceName: ValueOf<OrbitJsSourceNames>) => SourceRequestQueueStatus;
  querySource: (queryBuilder: QueryBuilderFunc, options?: Record<string, any>) => Promise<QueryResultData | never>;
  querySourceCache: (queryBuilder: QueryBuilderFunc, options?: Record<string, any>) => QueryResultData | never;
  processRequestQueue: (
    predicatedInstructions: PredicatedSourceInstructions<TaskQueueProcessInstructions>
  ) => Promise<SourceChangeResult[] | never>;
  recoverRequestQueue: (
    predicatedInstructions: PredicatedSourceInstructions<TaskQueueRecoveryInstructions>
  ) => Promise<SourceChangeResult[] | never>;
  setAutoProcess: (
    predicatedInstructions: PredicatedSourceInstructions<Required<TaskQueueProcessInstructions>>
  ) => SourceChangeResult[];
  updateSource: (record: OrbitRecord) => Promise<void | never>;
};

export type OrbitJsHookParams = {
  listeners?: {
    pullable?: {
      onSuccess?: Listener;
      onFail?: Listener;
    };
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

const isPromiseFulfilledResult = <T = any>(value: PromiseSettledResult<T>): value is PromiseFulfilledResult<T> =>
  value.status === 'fulfilled';

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

/**
 * A reusable source.requestQueue Task process Promise factory.
 *
 * @param source - An instance extending Source
 * @param predicatedInstructions - A predicate and instructions to be applied to source.
 * @returns SourceChangeResult
 */
const createSourceRequestQueueProcessPromise = (params: {
  source: Source;
  predicatedInstructions: PredicatedSourceInstructions<TaskQueueProcessInstructions>;
}): Promise<SourceChangeResult> => {
  const { source, predicatedInstructions } = params;
  const { predicate, instructions } = predicatedInstructions;
  const { autoProcessControl } = instructions;
  const sourceName = source.name;
  return predicate(source)
    ? new Promise<SourceChangeResult>((resolve, reject) => {
        let changed: boolean = false;
        source.requestQueue
          .process()
          .then(() => {
            /**
             * If processing was successful, the queue is expected to be empty otherwise an exception is expected.
             */
            if (source.requestQueue.empty) {
              const autoProcess = autoProcessControl
                ? autoProcessControl('success', sourceName, source.requestQueue.autoProcess)
                : source.requestQueue.autoProcess;
              if (source.requestQueue.autoProcess !== autoProcess) {
                logger.debug(
                  `Setting '${sourceName}' requestQueue 'autoProcess' to ${autoProcess} after successful process.`
                );
                /* eslint-disable-next-line no-param-reassign */
                source.requestQueue.autoProcess = autoProcess;
              }
              changed = true;
              resolve({ sourceName, changed });
            } else {
              reject(new Error(`'${sourceName}' requestQueue is not empty after process.`));
            }
          })
          .catch((error: any) => {
            logger.debug(`Catching '${sourceName}' requestQueue process error.`);
            const autoProcess = autoProcessControl
              ? autoProcessControl('fail', sourceName, source.requestQueue.autoProcess)
              : source.requestQueue.autoProcess;
            if (source.requestQueue.autoProcess !== autoProcess) {
              logger.debug(
                `Setting '${sourceName}' requestQueue 'autoProcess' to ${autoProcess} after unsuccessful process.`
              );
              /* eslint-disable-next-line no-param-reassign */
              source.requestQueue.autoProcess = autoProcess;
            }
            reject(error);
          });
      })
    : Promise.resolve({ sourceName, changed: false });
};

/**
 * A reusable source.requestQueue Task no args recovery Promise factory.
 *
 * @param source - An instance extending Source
 * @param predicate - A predicate which determines if strategy and autoProcessControl are to be applied to source.
 * @param strategy - The recovery strategy to apply.
 * @param autoProcessControl - The optional autoProcessControl to apply after strategy. If undefined the autoProcess value set before strategy is restored.
 * @returns SourceChangeResult
 */
const createSourceRequestQueueExecPromise = (
  source: Source,
  predicate: Predicate<Source>,
  strategy: Exclude<TaskQueueRecoveryStrategy, 'requeue'>,
  autoProcessControl?: TaskQueueAutoProcessControl
): Promise<SourceChangeResult> => {
  const sourceName = source.name;
  return predicate(source)
    ? new Promise<SourceChangeResult>((resolve) => {
        const prevAutoProcess = source.requestQueue.autoProcess;
        let changed: boolean = false;

        if (source.requestQueue.autoProcess) {
          logger.debug(`Setting '${sourceName}' requestQueue 'autoProcess' to false before '${strategy}'.`);
          /* eslint-disable-next-line no-param-reassign */
          source.requestQueue.autoProcess = false;
        }
        source.requestQueue[strategy]()
          .catch(() => {
            // If the task queue processing resulted in an error being thrown
            // that error will be rethrown here as a result of the task being removed.
            // This is to be expected and must be handled here.
            logger.debug(`Catching '${sourceName}' requestQueue '${strategy}' error.`);
          })
          .finally(() => {
            logger.debug(`Successfully called '${sourceName}' requestQueue '${strategy}'.`);
            const autoProcess = autoProcessControl
              ? autoProcessControl('success', sourceName, prevAutoProcess)
              : prevAutoProcess;
            if (source.requestQueue.autoProcess !== autoProcess) {
              logger.debug(`Setting '${sourceName}' requestQueue 'autoProcess' to ${autoProcess} after '${strategy}'.`);
              /* eslint-disable-next-line no-param-reassign */
              source.requestQueue.autoProcess = autoProcess;
            }
            changed = true;
            resolve({ sourceName, changed });
          });
      })
    : Promise.resolve({ sourceName, changed: false });
};

/**
 * A reusable source.requestQueue Task requeue recovery Promise factory.
 *
 * @param source - An instance extending Source
 * @param predicate - A predicate which determines if strategy and autoProcessControl are to be applied to source.
 * @param autoProcessControl - The optional autoProcessControl to apply after strategy. If undefined the autoProcess value set before strategy is restored.
 * @returns SourceChangeResult
 */
const createSourceRequestQueueTaskRequeuePromise = (
  source: Source,
  predicate: Predicate<Source>,
  autoProcessControl?: TaskQueueAutoProcessControl
): Promise<SourceChangeResult> => {
  const sourceName = source.name;
  return predicate(source)
    ? new Promise<SourceChangeResult>((resolve) => {
        const prevAutoProcess = source.requestQueue.autoProcess;
        let changed: boolean = false;

        if (source.requestQueue.autoProcess) {
          logger.debug(`Setting '${sourceName}' requestQueue 'autoProcess' to false before 'requeue'.`);
          /* eslint-disable-next-line no-param-reassign */
          source.requestQueue.autoProcess = false;
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
          .then((currentTask: Task) => {
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
            logger.debug(`Successfully called '${sourceName}' requestQueue 'requeue'.`);
            const autoProcess = autoProcessControl
              ? autoProcessControl('success', sourceName, prevAutoProcess)
              : prevAutoProcess;
            if (source.requestQueue.autoProcess !== autoProcess) {
              logger.debug(`Setting '${sourceName}' requestQueue 'autoProcess' to ${autoProcess} after 'requeue'.`);
              /* eslint-disable-next-line no-param-reassign */
              source.requestQueue.autoProcess = autoProcess;
            }
            changed = true;
            resolve({ sourceName, changed });
          });
      })
    : Promise.resolve({ sourceName, changed: false });
};

const setSourceAutoProcess = (params: {
  source: Source;
  predicatedInstructions: PredicatedSourceInstructions<Required<TaskQueueProcessInstructions>>;
}): SourceChangeResult => {
  const { source, predicatedInstructions } = params;
  const { predicate, instructions } = predicatedInstructions;
  const { autoProcessControl } = instructions;
  const sourceName = source.name;
  let changed: boolean = false;
  if (predicate(source)) {
    const autoProcess = autoProcessControl(
      !sourceRequestQueueHasErrorPredicate(source) ? 'success' : 'fail',
      sourceName,
      source.requestQueue.autoProcess
    );
    if (source.requestQueue.autoProcess !== autoProcess) {
      logger.debug(`Setting '${sourceName}' requestQueue 'autoProcess' to ${autoProcess}.`);
      /* eslint-disable-next-line no-param-reassign */
      source.requestQueue.autoProcess = autoProcess;
      changed = true;
    }
  }
  return { sourceName, changed };
};

const settleAllPromises = <T = any>(
  resolve: (value: T[] | PromiseLike<T[]>) => void,
  reject: (reason?: any) => void,
  ...promises: Promise<T>[]
): void => {
  if (!promises.length) {
    throw new TypeError('promises argument must contain at least one item.');
  }
  Promise.allSettled(promises)
    .then((values: PromiseSettledResult<T>[]) => {
      const rejected: Undefinable<PromiseRejectedResult> = values.find(isPromiseRejectedResult);
      if (rejected) {
        reject(rejected.reason);
      } else {
        const resolveValue = values.filter(isPromiseFulfilledResult).map((value): T => value.value);
        resolve(resolveValue);
      }
    })
    .catch((error: any) => {
      reject(error);
    });
};

const useOrbitJsHook = (params: OrbitJsHookParams): OrbitJsHookResult => {
  const { listeners, useOrbitJsContext } = params;
  const { onSuccess: onPullSuccess, onFail: onPullFail } = coerceAsReadonlyObject(listeners?.pullable);
  const { onSuccess: onPushSuccess, onFail: onPushFail } = coerceAsReadonlyObject(listeners?.pushable);
  const { onSuccess: onUpdateSuccess, onFail: onUpdateFail } = coerceAsReadonlyObject(listeners?.updatable);
  const { onSuccess: onSyncSuccess, onFail: onSyncFail } = coerceAsReadonlyObject(listeners?.syncable);

  // Context value should never change as long as provider is mounted.
  const { sources } = coerceAsReadonlyObject(useOrbitJsContext());
  const { memory, remote } = coerceAsReadonlyObject(sources);

  // Register/Deregister optional remote push error listener (i.e. to requeue a failed remote query)
  useEffect((): (() => void) => {
    // JSONAPISource implements the Pushable interface
    return createRegisterListenerCallback('pullFail', remote, onPullFail);
  }, [remote, onPushFail]);

  useEffect((): (() => void) => {
    // JSONAPISource implements the Pushable interface
    return createRegisterListenerCallback('pull', remote, onPullSuccess);
  }, [remote, onPushSuccess]);

  // Register/Deregister optional remote push error listener (i.e. to requeue a failed remote update)
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

  // Register/Deregister optional update complete listener (i.e. to trigger query)
  useEffect((): (() => void) => {
    // MemorySource implements the Updatable interface
    return createRegisterListenerCallback('update', memory, onUpdateSuccess);
  }, [memory, onUpdateSuccess]);

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

  const getSourceRequestQueueStatus = useMemo(() => {
    return (sourceName: ValueOf<OrbitJsSourceNames>): SourceRequestQueueStatus => {
      if (!memory) {
        throw new Error('memorySource not defined in Context.');
      }
      if (!remote) {
        throw new Error('remoteSource not defined in Context.');
      }
      const source = sourceName === 'memory' ? memory : remote;
      return {
        sourceName,
        autoProcess: !!source.requestQueue.autoProcess,
        hasError: !isNil(source.requestQueue.error),
        taskType: source.requestQueue.current?.type,
      };
    };
  }, [memory, remote]);

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

  const setAutoProcess = useMemo(
    () =>
      (
        predicatedInstructions: PredicatedSourceInstructions<Required<TaskQueueProcessInstructions>>
      ): SourceChangeResult[] => {
        if (!memory) {
          throw new Error('memorySource not defined in Context.');
        }
        if (!remote) {
          throw new Error('remoteSource not defined in Context.');
        }
        const result: SourceChangeResult[] = [];
        result.push(setSourceAutoProcess({ source: memory, predicatedInstructions }));
        result.push(setSourceAutoProcess({ source: remote, predicatedInstructions }));
        return result;
      },
    [memory, remote]
  );

  // Memoize processRequestQueue closure
  const processRequestQueue = useMemo(() => {
    return async (
      predicatedInstructions: PredicatedSourceInstructions<TaskQueueProcessInstructions>
    ): Promise<SourceChangeResult[] | never> => {
      if (!memory) {
        throw new Error('memorySource not defined in Context.');
      }
      if (!remote) {
        throw new Error('remoteSource not defined in Context.');
      }
      return new Promise<SourceChangeResult[]>((resolve, reject): void => {
        /**
         * Create combined remote/memory source requestQueue process promise, the order is intented to only
         * process the memory requestQueue if the remote requestQueue is successfully processed.
         */
        const remotePromise = createSourceRequestQueueProcessPromise({ source: remote, predicatedInstructions });
        const memoryPromise = createSourceRequestQueueProcessPromise({ source: memory, predicatedInstructions });
        settleAllPromises(resolve, reject, remotePromise, memoryPromise);
      });
    };
  }, [memory, remote]);

  // Memoize recoverRequestQueue closure
  const recoverRequestQueue = useMemo(() => {
    return (
      predicatedInstructions: PredicatedSourceInstructions<TaskQueueRecoveryInstructions>
    ): Promise<SourceChangeResult[] | never> => {
      if (!memory) {
        throw new Error('memorySource not defined in Context.');
      }
      if (!remote) {
        throw new Error('remoteSource not defined in Context.');
      }
      const { predicate, instructions } = predicatedInstructions;
      const { strategy, autoProcessControl } = instructions;
      switch (strategy) {
        case 'clear':
        case 'retry':
        case 'shift':
        case 'skip':
          return new Promise<SourceChangeResult[]>((resolve, reject) => {
            /**
             * Returns a mapped remote/memory source change result of each promise.
             * When synced the memory requestQueue will only be processed if the
             * remote requestQueue is successfully processed first or in the case of
             * the empty queue indicates that there were no items left to process.
             */
            const remotePromise = createSourceRequestQueueExecPromise(remote, predicate, strategy, autoProcessControl);
            const memoryPromise = createSourceRequestQueueExecPromise(memory, predicate, strategy, autoProcessControl);
            settleAllPromises(resolve, reject, remotePromise, memoryPromise);
          });
        case 'requeue':
          return new Promise<SourceChangeResult[]>((resolve, reject) => {
            /**
             * Create combined remote/memory source requestQueue task requeue promise, the order is intented to only
             * execute the memory requestQueue if the remote requestQueue is successfully executed.
             */
            const remotePromise = createSourceRequestQueueTaskRequeuePromise(remote, predicate, autoProcessControl);
            const memoryPromise = createSourceRequestQueueTaskRequeuePromise(memory, predicate, autoProcessControl);
            settleAllPromises(resolve, reject, remotePromise, memoryPromise);
          });
        default:
          return Promise.reject(
            new TypeError(`Unknown requestQueue recovery strategy requested: '${strategy}'. Doing nothing.`)
          );
      }
    };
  }, [memory, remote]);

  return {
    getSourceRequestQueueStatus,
    querySource,
    querySourceCache,
    processRequestQueue,
    recoverRequestQueue,
    setAutoProcess,
    updateSource,
  };
};

export default useOrbitJsHook;
