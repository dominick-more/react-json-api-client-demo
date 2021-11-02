import { Nil, Nillable } from '~/types/common/commonJs';

const regExpBlank = /^\s*$/;

export const isNil = (value: unknown): value is undefined | null => {
  return value === undefined || value === null;
};

export const isNull = (value: unknown): value is null => {
  return value === null;
};

export const isUndefined = (value: unknown): value is undefined => {
  return value === undefined;
};

export const isBoolean = (value: unknown): value is boolean => {
  return value === true || value === false || typeof value === 'boolean';
};

export const isFunction = (value: unknown): value is (...args: any[]) => any => {
  return typeof value === 'function';
};

export const isNumber = (value: unknown): value is number => {
  return typeof value === 'number';
};

export const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};

export const isPlainObject = (value: unknown): value is Record<string, any> => {
  if (isUndefined(value)) {
    return false;
  }
  return typeof value === 'object' && value !== null && value.constructor === Object;
};

export const isError = (value: unknown): value is Error => {
  return !isNil(value) && value instanceof Error;
};

export const isBlankString = (value: Nillable<string>): value is Nil => {
  return isNil(value) || regExpBlank.test(value);
};

export const arrayIncludesValue = <T, V extends T>(value: V, allValues?: Readonly<T[]>): value is V => {
  return isNil(allValues) || allValues.includes(value);
};
