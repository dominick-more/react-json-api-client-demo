import Coordinator, { RequestStrategy, SyncStrategy } from '@orbit/coordinator';
import MemorySource from '@orbit/memory';
import JSONAPISource, { JSONAPISerializer } from '@orbit/jsonapi';
import { Schema } from '@orbit/data';
import logger from 'loglevel';
import { OrbitJsSourceNames } from '~/types/orbit-js/orbitJsContextValue';

/* eslint class-methods-use-this: ["error", { "exceptMethods": ["resourceRelationship", "resourceAttribute"] }] */

class NoDasherizedJSONAPISerializer extends JSONAPISerializer {
  resourceType(type: string): string {
    return this.schema.pluralize(type);
  }

  resourceRelationship(_type: string, relationship: string): string {
    return relationship;
  }

  resourceAttribute(_type: string, attr: string): string {
    return attr;
  }
}

type CreateJsonApiCoordinatorParams = Readonly<{
  schema: Schema;
  jsonApiSource: Readonly<{
    host: string;
    namespace: string;
  }>;
}>;

const createJsonApiCoordinator = (params: CreateJsonApiCoordinatorParams): Coordinator => {
  const { jsonApiSource, schema } = params;
  const memorySource = new MemorySource({
    schema,
    name: OrbitJsSourceNames.memory,
  });

  const remoteSource = new JSONAPISource({
    ...jsonApiSource,
    schema,
    name: OrbitJsSourceNames.remote,
    SerializerClass: NoDasherizedJSONAPISerializer,
  });

  const coordinator = new Coordinator({
    sources: [memorySource, remoteSource],
  });

  // Query the remote server whenever the memory source is queried
  coordinator.addStrategy(
    new RequestStrategy({
      source: OrbitJsSourceNames.memory,
      on: 'beforeQuery',
      target: OrbitJsSourceNames.remote,
      action: 'pull',
      blocking: true,
    })
  );

  // Update the remote server whenever the memory source is updated
  coordinator.addStrategy(
    new RequestStrategy({
      source: OrbitJsSourceNames.memory,
      on: 'beforeUpdate',
      target: OrbitJsSourceNames.remote,
      action: 'push',
      blocking: false,
      catch: (error: any) => {
        logger.warn('Error captured in remote target push.', error);
      },
    })
  );

  // Sync all changes received from the remote server to the memory source
  coordinator.addStrategy(
    new SyncStrategy({
      source: OrbitJsSourceNames.remote,
      target: OrbitJsSourceNames.memory,
      blocking: true,
    })
  );
  return coordinator;
};

export default createJsonApiCoordinator;

export type { CreateJsonApiCoordinatorParams };
