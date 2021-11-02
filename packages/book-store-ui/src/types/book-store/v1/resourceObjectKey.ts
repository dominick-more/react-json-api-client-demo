/**
 * Bookstore JSON API resource object key.
 * @typedef ResourceObjectKey
 * @type {object}
 * @property {string} id - resource object id
 * @property {string} type - resource object type
 */
export interface ResourceObjectKey<T extends string> {
  id: string;
  type: T;
}
