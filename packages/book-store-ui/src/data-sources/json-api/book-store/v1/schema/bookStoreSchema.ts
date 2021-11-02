import { ModelDefinition, Schema } from '@orbit/data';
import authors from './authorModelDefinition';
import books from './bookModelDefinition';
import countries from './countryModelDefinition';
import stores from './storeModelDefinition';

const pluralizeInflectionMap: Readonly<Record<string, string>> = Object.freeze({
  book: 'books',
  store: 'stores',
  author: 'authors',
  country: 'countries',
});

// const singularizeInflectionMap: Readonly<Record<string, string>> = Object.freeze({
//   books: 'book',
//   stores: 'store',
//   authors: 'author',
//   countries: 'country',
// });

const pluralizeInflect = (word: string): string => {
  return pluralizeInflectionMap[word] || word;
};

const singularizeInflect = (word: string): string => {
  // return singularizeInflectionMap[word] || word;
  return word;
};

const ModelMap: Readonly<Record<string, ModelDefinition>> = Object.freeze({
  stores,
  books,
  authors,
  countries,
});

const BookStoreSchema = new Schema({
  version: 1,
  models: ModelMap,
  pluralize: pluralizeInflect,
  singularize: singularizeInflect,
});

export default BookStoreSchema;
