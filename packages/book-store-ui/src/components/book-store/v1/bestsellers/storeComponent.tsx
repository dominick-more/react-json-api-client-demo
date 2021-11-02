import React from 'react';
import logger from 'loglevel';
import { Book } from '~/types/book-store/v1/book';
import { Store } from '~/types/book-store/v1/store';
import { Undefinable } from '~/types/common/commonJs';
import { isBlankString } from '~/utils/common/typeGuards';
import { coerceAsArray, coerceAsReadonlyObject } from '~/utils/common/transformers';
import StoreRatingComponent, { ClickRatingHandler } from './storeRatingComponent';
import './storeComponent.css';

const formatStoreDisplayDate = (store?: Store): Undefinable<string> => {
  const { establishmentDate, id } = coerceAsReadonlyObject(store);
  if (isBlankString(establishmentDate)) {
    return undefined;
  }
  try {
    const date = new Date(establishmentDate.trim());
    if (!Number.isFinite(date.getTime())) {
      logger.warn(`Unable to format store establishmentDate of id ${id} with value '${establishmentDate}'.`);
      return undefined;
    }
    const formattedDateParts = [
      String(date.getDate()).padStart(2, '0'),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getFullYear()).padStart(4, '0'),
    ];
    return formattedDateParts.join('/');
  } catch (error) {
    logger.warn(`Unable to format store establishmentDate of id ${id} with value '${establishmentDate}'.`, error);
    return undefined;
  }
};

const getStoreHostname = (store?: Store): Undefinable<string> => {
  const { id, website } = coerceAsReadonlyObject(store);
  if (isBlankString(website)) {
    return undefined;
  }
  try {
    return new URL(website.trim()).hostname;
  } catch (error) {
    logger.warn(`Unable to get hostname for store website of id ${id} with value '${website}'.`, error);
    return undefined;
  }
};

type StoreInfoComponentProps = {
  data?: Store;
};

const StoreInfoComponent = (props: StoreInfoComponentProps): React.ReactElement => {
  const { data } = coerceAsReadonlyObject(props);

  const infoFragments: React.ReactElement[] = [];
  const displayDate = formatStoreDisplayDate(data);
  if (!isBlankString(displayDate)) {
    infoFragments.push(
      <span data-attribute="establishmentDate" key="establishmentDate">
        {displayDate}
      </span>
    );
  }
  const hostname = getStoreHostname(data);
  if (!isBlankString(hostname)) {
    if (infoFragments.length) {
      infoFragments.push(<span key="joiner">&nbsp;-&nbsp;</span>);
    }
    infoFragments.push(
      <span key="website">
        <a data-attribute="website" href={data?.website} target="_blank" rel="noreferrer">
          {hostname}
        </a>
      </span>
    );
  }
  return <div className="bestsellers-store-info">{infoFragments}</div>;
};

type StoreBookFragmentComponentProps = {
  data: Book;
};

const StoreBookFragmentComponent = (props: StoreBookFragmentComponentProps): React.ReactElement => {
  const { data } = coerceAsReadonlyObject(props);
  return (
    <React.Fragment key={data?.id}>
      <span data-attribute="name" title={`Copies sold: ${data?.copiesSold}`}>
        {data?.name}
      </span>
      <span data-attribute="author">{data?.author?.fullName}</span>
    </React.Fragment>
  );
};

type StoreBookBodyComponentProps = {
  data?: Book[];
};
const StoreBookBodyComponent = (props: StoreBookBodyComponentProps): React.ReactElement => {
  const { data } = coerceAsReadonlyObject(props);
  const bookFragments = coerceAsArray(data)
    .slice(0, 2)
    .map((book: Book): React.ReactElement => {
      return <StoreBookFragmentComponent data={book} key={book?.id} />;
    });
  if (bookFragments.length === 0) {
    bookFragments.push(
      <span className="bestsellers-store-body-empty" key="empty">
        No data available
      </span>
    );
  } else if (bookFragments.length === 1) {
    bookFragments.push(<span className="bestsellers-store-body-filler" key="fill" />);
  }
  return (
    <div className="bestsellers-store-body">
      <span>Best-selling books</span>
      <div>{bookFragments}</div>
    </div>
  );
};
export type StoreComponentProps = {
  data?: Store;
  onClickRating?: ClickRatingHandler;
};

const StoreComponent = (props: StoreComponentProps): React.ReactElement => {
  const { data, onClickRating } = coerceAsReadonlyObject(props);
  return (
    <article className="bestsellers-store" data-attribute="store">
      <div className="bestsellers-store-image">
        <img src={data?.storeImage} alt="Store" data-attribute="storeImage" />
      </div>
      <div className="bestsellers-store-header">
        <span data-attribute="name">{data?.name}</span>
        <span data-attribute="rating">
          <StoreRatingComponent data={data} onClickRating={onClickRating} />
        </span>
      </div>
      <StoreBookBodyComponent data={data?.books} />
      <div className="bestsellers-store-footer">
        <StoreInfoComponent data={data} />
        <div className="bestsellers-store-flag">
          {!isBlankString(data?.country?.code) && (
            <img
              src={`https://flagcdn.com/w320/${String(data?.country?.code).toLowerCase()}.png`}
              alt={`Flag: ${data?.country?.code}`}
            />
          )}
        </div>
      </div>
    </article>
  );
};

export default StoreComponent;
