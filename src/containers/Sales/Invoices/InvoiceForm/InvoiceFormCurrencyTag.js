import React from 'react';
import { BaseCurrency, BaseCurrencyRoot } from 'components';
import { useInvoiceFormContext } from './InvoiceFormProvider';

/**
 * Invoice form currency tag.
 */
export default function InvoiceFormCurrencyTag() {
  const { isForeignCustomer, selectCustomer } = useInvoiceFormContext();

  if (!isForeignCustomer) {
    return null;
  }

  return (
    <BaseCurrencyRoot>
      <BaseCurrency currency={selectCustomer?.currency_code} />
    </BaseCurrencyRoot>
  );
}
