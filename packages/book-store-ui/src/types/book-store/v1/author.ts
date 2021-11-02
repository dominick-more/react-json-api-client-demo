import { ResourceObjectKey } from './resourceObjectKey';

/**
 * Bookstore JSON API Author resource object.
 * @typedef Author
 * @type {object}
 * @property {string} fullName - fullName
 */
export interface Author extends ResourceObjectKey<'authors'> {
  fullName: string;
}
