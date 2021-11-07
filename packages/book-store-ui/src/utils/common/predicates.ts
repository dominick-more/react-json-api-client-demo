import { Predicate } from '~/types/common/commonJs';

export const createAndPredicate = <T>(...predicates: Predicate<T>[]): Predicate<T> => {
  return (value: T) => predicates.every((predicate) => predicate(value));
};

export const createOrPredicate = <T>(...predicates: Predicate<T>[]): Predicate<T> => {
  return (value: T) => predicates.some((predicate) => predicate(value));
};

export const createNotPredicate = <T>(predicate: Predicate<T>): Predicate<T> => {
  return (value: T) => !predicate(value);
};
