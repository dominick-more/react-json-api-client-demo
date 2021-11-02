import { ModelDefinition } from '@orbit/data';

const CountryModelDefinition: ModelDefinition = {
  keys: {
    remoteId: {},
  },
  attributes: {
    code: {
      type: 'string',
    },
  },
  relationships: {
    stores: {
      type: 'hasMany',
      model: 'stores',
      inverse: 'country',
    },
  },
};

export default CountryModelDefinition;
