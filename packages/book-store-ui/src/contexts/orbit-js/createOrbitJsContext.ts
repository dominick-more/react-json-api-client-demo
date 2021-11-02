import { Context, createContext, useContext } from 'react';
import { Undefinable } from '~/types/common/commonJs';
import { OrbitJsContextValue } from '~/types/orbit-js/orbitJsContextValue';

type CreateOrbitJsContextResult = [Context<Undefinable<OrbitJsContextValue>>, () => Undefinable<OrbitJsContextValue>];

const createOrbitJsContext = (): CreateOrbitJsContextResult => {
  const OrbitJsContext = createContext<Undefinable<OrbitJsContextValue>>(undefined);
  const useOrbitJsContext = (): Undefinable<OrbitJsContextValue> => {
    return useContext(OrbitJsContext);
  };
  return [OrbitJsContext, useOrbitJsContext];
};

export default createOrbitJsContext;

export type { CreateOrbitJsContextResult };
