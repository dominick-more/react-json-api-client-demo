import React, { useMemo } from 'react';
import { Store } from '~/types/book-store/v1/store';
import { Undefinable } from '~/types/common/commonJs';
import { coerceAsReadonlyObject } from '~/utils/common/transformers';
import { isNil } from '~/utils/common/typeGuards';
import './storeRatingComponent.css';

const minRating = 0;
const maxRating = 5;

const starPath =
  'M 0,-200 52.9,-72.81 190.21,-61.8 85.6,27.81 117.56,161.8 0,90 -117.56,161.8 -85.6,27.81 -190.21,-61.8 -52.9,-72.81Z';

const normalizeRating = (rating: number): number => {
  return Math.round(Math.min(Math.max(rating, minRating), maxRating));
};

type ClickRatingHandler = (storeId: string, ratingValue: number) => void;

type StoreRatingComponentProps = {
  data?: Store;
  onClickRating?: ClickRatingHandler;
};

const StoreRatingComponent = (props: StoreRatingComponentProps): React.ReactElement => {
  const { data, onClickRating } = coerceAsReadonlyObject(props);
  const { id: storeId, rating } = coerceAsReadonlyObject(data);
  const onClick: Undefinable<React.MouseEventHandler<HTMLButtonElement>> = useMemo(() => {
    return !isNil(storeId) && onClickRating
      ? (event) => {
          const { currentTarget } = event;
          const ratingValue = Number(currentTarget.value);
          onClickRating(storeId, ratingValue);
        }
      : undefined;
  }, [onClickRating, storeId]);
  const effectiveRating = normalizeRating(!isNil(rating) ? rating : 0);
  const starElements: React.ReactElement[] = Array(maxRating)
    .fill(0)
    .map((_value, index) => {
      const ratingValue = index + 1;
      const ratingApplied = effectiveRating >= ratingValue;
      return (
        <button
          key={ratingValue}
          aria-checked={ratingApplied}
          aria-label="Star"
          role="switch"
          type="button"
          value={ratingValue}
          onClick={onClick}
        >
          <svg stroke="currentColor" viewBox="0 0 500 500">
            <path d={starPath} transform="translate(250, 250)" />
          </svg>
        </button>
      );
    });
  return <div className="bestsellers-store-rating">{starElements}</div>;
};

export default StoreRatingComponent;

export type { ClickRatingHandler, StoreRatingComponentProps };

export { normalizeRating };
