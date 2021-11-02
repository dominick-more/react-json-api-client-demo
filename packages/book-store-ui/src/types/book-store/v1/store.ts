import { Book } from './book';
import { Country } from './country';
import { ResourceObjectKey } from './resourceObjectKey';

/**
 * Bookstore JSON API Store resource object.
 * @typedef Store
 * @type {object}
 * @property {string} name - name
 * @property {string} storeImage - image resource uri
 * @property {string} establishmentDate - ISO 8601 format
 * @property {string} website - store landing url
 * @property {number} rating - an integer value of range [0..5]
 * @property {Country} country - country
 * @property {Book[]} books - books
 */
export interface Store extends ResourceObjectKey<'stores'> {
  name: string;
  storeImage: string;
  establishmentDate: string;
  website: string;
  rating: number;
  country?: Country;
  books: Book[];
}
