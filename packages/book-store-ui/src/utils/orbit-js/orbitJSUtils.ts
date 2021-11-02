import { Exception as OrbitException } from '@orbit/core';
import { Operation, RecordIdentity, Transform, UpdateRecordOperation } from '@orbit/data';
import { PlainObject } from '~/types/common/commonJs';
import { isNil, isPlainObject, isString } from '~/utils/common/typeGuards';

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

export { isOperation, isOrbitException, isRecordIdentity, isRecordIdentityOperation, isTransform, isUpdateRecordOperation };

export type { RecordIdentityOperation };
