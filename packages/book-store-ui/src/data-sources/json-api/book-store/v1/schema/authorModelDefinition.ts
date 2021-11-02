import { ModelDefinition } from '@orbit/data';

const authorModelDefinition: ModelDefinition = {
  keys: {
    remoteId: {},
  },
  attributes: {
    fullName: {
      type: 'string',
    },
  },
  relationships: {
    books: {
      type: 'hasMany',
      model: 'books',
      inverse: 'author',
    },
  },
};

export default authorModelDefinition;
