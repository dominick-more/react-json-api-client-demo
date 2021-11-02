import MemorySource from '@orbit/memory';
import JSONAPISource from '@orbit/jsonapi';

const enum OrbitJsSourceNames {
  memory = 'memory',
  remote = 'remote',
}

type OrbitJsContextValue = {
  sources: {
    [OrbitJsSourceNames.memory]: MemorySource;
    [OrbitJsSourceNames.remote]: JSONAPISource;
  };
};

export type { OrbitJsContextValue };

export { OrbitJsSourceNames };
