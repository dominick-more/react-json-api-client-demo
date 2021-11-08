import { Exception as OrbitException } from '@orbit/core';
import { Operation, Query, QueryExpression, RecordIdentity, Source, Transform, UpdateRecordOperation } from '@orbit/data';
import { PlainObject, Predicate, Undefinable, ValueOf } from '~/types/common/commonJs';
import { OrbitJsSourceNames } from '~/types/orbit-js/orbitJsContextValue';
import { arrayIncludesValue, isBlankString, isError, isNil, isPlainObject, isString } from '~/utils/common/typeGuards';
import { coerceAsDefault } from '~/utils/common/transformers';

export type RecordIdentityOperation = Operation & { record: RecordIdentity };

export const createSourceNamesPredicate = (...sourceNames: Readonly<ValueOf<OrbitJsSourceNames>[]>): Predicate<Source> => {
  return (source: Source) => arrayIncludesValue(source.name, sourceNames);
};

export const createSourceRequestQueueCurrentTaskTypePredicate = (taskTypeMatch: RegExp): Predicate<Source> => {
  return (source: Source) => taskTypeMatch?.test(coerceAsDefault(source.requestQueue?.current?.type, ''));
};

export const sourceRequestQueueHasErrorPredicate = (source: Source) => !isNil(source.requestQueue?.error);

export const isOrbitException = (value: unknown): value is OrbitException => {
  return !isNil(value) && value instanceof OrbitException;
};

const networkErrorMessageRegExp = /\s*(Network\s+error\s*:|Server\s+error\s*:\s*Gateway\s+Timeout).*/i;

export const isNetworkError = (exceptionOrError: any): boolean => {
  const maybeError = isOrbitException(exceptionOrError) ? exceptionOrError.error : exceptionOrError;
  return isError(maybeError) && networkErrorMessageRegExp.test(maybeError.message);
};

export const isQueryExpression = (value: unknown): value is QueryExpression & PlainObject => {
  return isPlainObject(value) && isString(value.op) && !isBlankString(value.op);
};

export const isOperation = (value: unknown): value is Operation & PlainObject => {
  return isPlainObject(value) && isString(value.op) && !isBlankString(value.op);
};

export const isQuery = (value: unknown): value is Query & PlainObject => {
  return isPlainObject(value) && isQueryExpression(value.expression);
};

export const isRecordIdentity = (value: unknown): value is RecordIdentity & PlainObject => {
  return (
    isPlainObject(value) &&
    isString(value.id) &&
    !isBlankString(value.id) &&
    isString(value.type) &&
    !isBlankString(value.type)
  );
};

export const isRecordIdentityOperation = (operation: unknown): operation is RecordIdentityOperation => {
  return isOperation(operation) && isRecordIdentity(operation.record);
};

export const isTransform = (value: unknown): value is Transform & PlainObject => {
  return isPlainObject(value) && isString(value.id) && !isBlankString(value.id) && Array.isArray(value.operations);
};

export const isUpdateRecordOperation = (value: unknown): value is UpdateRecordOperation & PlainObject => {
  return isRecordIdentityOperation(value) && value.op === 'updateRecord';
};

export const coerceOrbitCatchReasonAsError = (value: unknown, defMessage: string = 'An unknown error occured.'): Error => {
  const resolveError = (): Undefinable<Error> => {
    if (isNil(value)) {
      return undefined;
    }
    if (isOrbitException(value)) {
      return value.error;
    }
    if (isError(value)) {
      return value;
    }
    if (isString(value) && !isBlankString(value)) {
      return new Error(value.trim());
    }
    return undefined;
  };
  return resolveError() || new Error(defMessage);
};
