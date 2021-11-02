import { ModelDefinition } from '@orbit/data';

const StoreModelDefinition: ModelDefinition = {
  keys: {
    remoteId: {},
  },
  attributes: {
    establishmentDate: {
      type: 'date-time',
    },
    name: {
      type: 'string',
    },
    rating: {
      type: 'number',
    },
    storeImage: {
      type: 'string',
    },
    website: {
      type: 'string',
    },
  },
  relationships: {
    books: {
      type: 'hasMany',
      model: 'books',
      inverse: 'stores',
    },
    country: {
      type: 'hasOne',
      model: 'countries',
      inverse: 'stores',
    },
  },
};

export default StoreModelDefinition;
