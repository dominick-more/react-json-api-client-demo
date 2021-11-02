import _cloneDeep from 'lodash/cloneDeep';
import _isEqual from 'lodash/isEqual';
import { coerceAsArray } from '~/utils/common/transformers';
import { isNil } from '~/utils/common/typeGuards';
import { Store } from '~/types/book-store/v1/store';
import { ResourceObjectKey } from '~/types/book-store/v1/resourceObjectKey';

const mergeArrayDeepEquality = <RO extends ResourceObjectKey<RT>, RT extends string = string>(
  prev: RO[],
  next?: RO[]
): RO[] => {
  type MergedResult = { modified: boolean; data: RO[] };
  const nextAsArray = coerceAsArray(next);
  const coalesced = nextAsArray.reduce(
    (accumulator: MergedResult, nextValue: RO): MergedResult => {
      if (!nextValue) {
        return accumulator;
      }
      const prevValue = prev.find((value) => value && value.type === nextValue.type && value.id === nextValue.id);
      if (prevValue && _isEqual(nextValue, prevValue)) {
        accumulator.data.push(prevValue);
      } else {
        accumulator.data.push(nextValue);
        accumulator.modified = true;
      }
      return accumulator;
    },
    { modified: prev.length !== nextAsArray.length, data: [] }
  );
  return coalesced.modified ? coalesced.data : prev;
};

type BookStoreState = {
  isLoading?: boolean;
  data: Array<Store>;
  error?: Error;
};

type BookStoreAction = {
  type: 'reset' | 'load' | 'complete';
  payload?: {
    data?: Array<Store>;
    error?: Error;
  };
};

const bookStoreInitialState: Readonly<BookStoreState> = {
  isLoading: undefined,
  data: [],
  error: undefined,
};

const bookStoreReducer = (state: BookStoreState, action: BookStoreAction): BookStoreState => {
  const { payload, type } = action;
  switch (type) {
    case 'load': {
      const newState: BookStoreState = {
        ...state,
        isLoading: true,
      };
      return _isEqual(state, newState) ? state : newState;
    }
    case 'complete': {
      const newState: BookStoreState = {
        ...state,
        isLoading: false,
        error: !isNil(payload?.error) ? payload?.error : undefined,
        data: isNil(payload?.error) ? mergeArrayDeepEquality(state.data, payload?.data) : state.data,
      };
      return _isEqual(state, newState) ? state : newState;
    }
    case 'reset':
      return _isEqual(state, bookStoreInitialState) ? state : _cloneDeep(bookStoreInitialState);
    default:
      throw new Error(`Unhandled bookStoreReducer action type '${type}'.`);
  }
};

export default bookStoreReducer;

export { bookStoreInitialState };

export type { BookStoreAction, BookStoreState };
