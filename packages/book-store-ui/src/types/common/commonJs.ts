export type Nil = undefined | null;

export type Nillable<T> = Nil | T;

export type Nullable<T> = null | T;

export type Undefinable<T> = undefined | T;

export type KeyOf<T> = keyof T;

export type ValueOf<T> = T[KeyOf<T>];

export type PlainObject = Record<string, any>;

export type Predicate<T> = (value: T) => boolean;
