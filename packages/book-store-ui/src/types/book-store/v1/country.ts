import { ResourceObjectKey } from './resourceObjectKey';

/**
 * Bookstore JSON API Country resource object.
 * @typedef Country
 * @type {object}
 * @property {string} code - 2-letter ISO 3166-1 country code
 */
export interface Country extends ResourceObjectKey<'countries'> {
  code: string;
}
