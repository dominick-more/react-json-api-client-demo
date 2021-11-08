import { Nillable, Undefinable } from '~/types/common/commonJs';
import { isFunction, isNil } from './typeGuards';

const emptyArray: ReadonlyArray<any> = Object.freeze([]);
const emptyObject: Readonly<any> = Object.freeze({});

export const coerceAsArray = <T = any>(value: Nillable<T | T[]>): T[] => {
  if (isNil(value)) {
    return [];
  }
  if (Array.isArray(value)) {
    return [...value];
  }
  return [value];
};

export const coerceAsDefault = <T>(value: Nillable<T>, def: T | (() => T)): T => {
  if (!isNil(value)) {
    return value;
  }
  return isFunction(def) ? def() : def;
};

export const coerceAsReadonlyArray = <T = any>(value: Nillable<T[]>): ReadonlyArray<T> => {
  return !isNil(value) ? value : emptyArray;
};

export const coerceAsReadonlyObject = <T extends Partial<Record<string, any>>>(value: Nillable<T>): Readonly<Partial<T>> => {
  return !isNil(value) ? value : emptyObject;
};

export const coerceErrorMessage = (
  error: unknown,
  defMessage?: string
): typeof defMessage extends string ? string : Undefinable<string> => {
  if (isNil(error)) {
    return defMessage;
  }
  if (error instanceof Error) {
    return error.message || defMessage;
  }
  return String(error) || defMessage;
};
