import { connect } from 'react-redux';
import {
  submitPaymentReceive,
  editPaymentReceive,
  deletePaymentReceive,
  fetchPaymentReceive,
  fetchPaymentReceivesTable,
} from 'store/PaymentReceive/paymentReceive.actions';
import t from 'store/types';

const mapDispatchToProps = (dispatch) => ({
  requestSubmitPaymentReceive: (form) =>
    dispatch(submitPaymentReceive({ form })),
  requestFetchPaymentReceive: (id) => dispatch(fetchPaymentReceive({ id })),
  requestEditPaymentReceive: (id, form) =>
    dispatch(editPaymentReceive( id, form )),
  requestDeletePaymentReceive: (id) => dispatch(deletePaymentReceive({ id })),
  requestFetchPaymentReceiveTable: (query = {}) =>
    dispatch(fetchPaymentReceivesTable({ query: { ...query } })),

  changePaymentReceiveView: (id) =>
    dispatch({
      type: t.PAYMENT_RECEIVE_SET_CURRENT_VIEW,
      currentViewId: parseInt(id, 10),
    }),

  addPaymentReceivesTableQueries: (queries) =>
    dispatch({
      type: t.PAYMENT_RECEIVE_TABLE_QUERIES_ADD,
      queries,
    }),
});

export default connect(null, mapDispatchToProps);
