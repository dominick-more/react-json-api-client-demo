import { ModelDefinition } from '@orbit/data';

const BookModelDefinition: ModelDefinition = {
  keys: {
    remoteId: {},
  },
  attributes: {
    name: {
      type: 'string',
    },
    copiesSold: {
      type: 'number',
    },
  },
  relationships: {
    author: {
      type: 'hasOne',
      model: 'authors',
      inverse: 'books',
    },
    stores: {
      type: 'hasMany',
      model: 'stores',
      inverse: 'books',
    },
  },
};

export default BookModelDefinition;
