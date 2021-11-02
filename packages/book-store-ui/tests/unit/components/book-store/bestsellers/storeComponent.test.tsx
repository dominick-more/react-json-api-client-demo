import React from 'react';
import { queryByAttribute, queryAllByAttribute } from '@testing-library/dom';
import { cleanup, render } from '@testing-library/react';
import _head from 'lodash/head';
import StoreComponent from '~/components/book-store/v1/bestsellers/storeComponent';
import singleBookStoreTestResources from '../../../../fixtures/json-api/book-store/v1/singleBookStoreTest01.json';
import { Store } from '~/types/book-store/v1/store';

afterEach(cleanup);

test('Simple StoreComponent test with valid data.', async () => {
  const { container } = render(<StoreComponent data={_head(singleBookStoreTestResources as Store[])} />);
  expect(queryByAttribute('data-attribute', container, 'storeImage')).toBeInTheDocument();
  const authorElements: HTMLElement[] = queryAllByAttribute('data-attribute', container, 'author');
  expect(authorElements).toHaveLength(2);
  authorElements.forEach((authorElement) => expect(authorElement).toHaveTextContent(/(Douglas Crockford|David Flanagan)/));
});
