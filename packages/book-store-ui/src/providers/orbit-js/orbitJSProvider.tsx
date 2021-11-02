import Coordinator from '@orbit/coordinator';
import JSONAPISource from '@orbit/jsonapi';
import MemorySource from '@orbit/memory';
import logger from 'loglevel';
import React, { PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { Undefinable } from '~/types/common/commonJs';
import { OrbitJsContextValue, OrbitJsSourceNames } from '~/types/orbit-js/orbitJsContextValue';
import createJsonApiCoordinator, { CreateJsonApiCoordinatorParams } from '~/utils/orbit-js/createJsonApiCoordinator';

type OrbitJsProviderParams = Readonly<{
  context: React.Context<Undefinable<OrbitJsContextValue>>;
  jsonApiSource: CreateJsonApiCoordinatorParams;
}>;

const OrbitJsProvider: React.FC<PropsWithChildren<OrbitJsProviderParams>> = (props): React.ReactElement => {
  const [isActivating, setIsActivating] = useState(true);
  const { children, jsonApiSource, context: Context } = props;

  // Memoize coordinator instance.
  const coordinator: Coordinator = useMemo(() => {
    return createJsonApiCoordinator(jsonApiSource);
  }, []);

  const memory = coordinator.getSource(OrbitJsSourceNames.memory) as MemorySource;
  const remote = coordinator.getSource(OrbitJsSourceNames.remote) as JSONAPISource;

  // Activate coordinator on mount
  useEffect(() => {
    const activateCoordinator = async (): Promise<void> => {
      if (isActivating) {
        logger.debug('Activating coordinator...');
        await coordinator.activate();
        setIsActivating(false);
      }
    };
    activateCoordinator();
  }, [isActivating, coordinator]);

  // Deactivate coordinator on unmount
  useEffect(() => {
    const deactivateCoordinator = (): void => {
      logger.debug('Deactivating coordinator...');
      coordinator.deactivate();
    };
    return () => deactivateCoordinator();
  }, [coordinator]);

  // Memoize context value.
  const value = useMemo(() => {
    return {
      sources: {
        memory,
        remote,
      },
    };
  }, [memory, remote]);

  return <Context.Provider value={value}>{isActivating ? 'activating...' : children}</Context.Provider>;
};

export default OrbitJsProvider;

export type { OrbitJsProviderParams };
