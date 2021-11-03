import { Exception as OrbitException } from '@orbit/core';
import { Operation, RecordIdentity, Transform, UpdateRecordOperation } from '@orbit/data';
import { PlainObject, Undefinable } from '~/types/common/commonJs';
import { isBlankString, isError, isNil, isPlainObject, isString } from '~/utils/common/typeGuards';

type RecordIdentityOperation = Operation & { record: RecordIdentity };

const isOperation = (value: unknown): value is Operation & PlainObject => {
  return isPlainObject(value) && isString(value.op);
};

const isOrbitException = (value: unknown): value is OrbitException => {
  return !isNil(value) && value instanceof OrbitException;
};

const isRecordIdentity = (value: unknown): value is RecordIdentity & PlainObject => {
  return isPlainObject(value) && isString(value.id) && isString(value.type);
};

const isRecordIdentityOperation = (operation: unknown): operation is RecordIdentityOperation => {
  return isOperation(operation) && isRecordIdentity(operation.record);
};

const isTransform = (value: unknown): value is Transform & PlainObject => {
  return isPlainObject(value) && isString(value.id) && Array.isArray(value.operations);
};

const isUpdateRecordOperation = (value: unknown): value is UpdateRecordOperation & PlainObject => {
  return isRecordIdentityOperation(value) && value.op === 'updateRecord';
};

const coerceOrbitCatchReasonAsError = (value: unknown, defMessage: string = 'An unknown error occured.'): Error => {
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

export {
  coerceOrbitCatchReasonAsError,
  isOperation,
  isOrbitException,
  isRecordIdentity,
  isRecordIdentityOperation,
  isTransform,
  isUpdateRecordOperation,
};

export type { RecordIdentityOperation };
