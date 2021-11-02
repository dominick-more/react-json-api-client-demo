import { Author } from './author';
import { ResourceObjectKey } from './resourceObjectKey';

/**
 * Bookstore JSON API Book resource object.
 * @typedef Book
 * @type {object}
 * @property {string} name - name
 * @property {number} copiesSold - copiesSold
 * @property {Author} author - author
 */
export interface Book extends ResourceObjectKey<'books'> {
  name: string;
  copiesSold: number;
  author?: Author;
}
