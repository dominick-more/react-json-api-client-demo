import Coordinator, { RequestStrategy, SyncStrategy } from '@orbit/coordinator';
import { Task } from '@orbit/core';
import { Query, Schema } from '@orbit/data';
import MemorySource from '@orbit/memory';
import JSONAPISource, { JSONAPISerializer } from '@orbit/jsonapi';
import _isEqual from 'lodash/isEqual';
import logger from 'loglevel';
import { OrbitJsSourceNames } from '~/types/orbit-js/orbitJsContextValue';
import { coerceOrbitCatchReasonAsError, isNetworkError, isQuery } from './orbitJSUtils';

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
      blocking: false,
      catch(this: RequestStrategy, error: any): void {
        if (!isNetworkError(error)) {
          throw error;
        }
        // A network http fetch error must be caught here as the error does not seem to be handled by orbit.
        // Even though intercepted, the same error should be passed later to a subscribed Pullable 'fail' listener.
        logger.warn(
          `handleFetchResponseError intercepted in remote target pull: ${coerceOrbitCatchReasonAsError(error).message}`
        );
      },
      filter(this: RequestStrategy, query: Query): boolean {
        if (!isQuery(query)) {
          return true;
        }
        // Do not push a query to the remote requestQueue if it already exists.
        const queryExists = this.target.requestQueue.entries.some((task: Task) => {
          return isQuery(task.data) && _isEqual(task.data.expression, query.expression);
        });
        return !queryExists;
      },
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
      catch(this: RequestStrategy, error: any): void {
        if (!isNetworkError(error)) {
          throw error;
        }
        // A network http fetch error must be caught here as the error does not seem to be handled by orbit.
        // Even though intercepted, the same error should be passed later to a subscribed Pullable 'fail' listener.
        logger.warn(
          `handleFetchResponseError intercepted in remote target push: ${coerceOrbitCatchReasonAsError(error).message}`
        );
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
