odoo.define('pos_retail.PopUpRegisterPayment', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const core = require('web.core');
    const _t = core._t;
    const {useExternalListener} = owl.hooks;

    class PopUpRegisterPayment extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            let order = this.props.order;
            this.state = useState({
                id: order.id,
            });
            this.changes = {
                id: order.id,
                amount: this.props.amount,
                payment_reference: this.props.payment_reference,
                payment_date: this.props.payment_date,
                payment_method_id: this.props.payment_methods[0].id,
            }
            this.orderUiState = useContext(contexts.orderManagement);
            useExternalListener(window, 'keyup', this._keyUp);
        }

        _keyUp(event) {
            if (event.key == 'Enter') {
                this.confirm()
            }
        }

        OnChange(event) {
            this.changes[event.target.name] = event.target.value;
            this.verifyChanges()
        }

        verifyChanges() {
            let changes = this.changes;
            if (changes.amount <= 0) {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = this.env._t('Payment Amount required bigger than 0');
                this.env.pos.wrongInput(this.el, 'input[name="amount"]');
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.env.pos.passedInput(this.el, 'input[name="amount"]');
            }
            if (changes.payment_reference == '') {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Payment Reference is required');
                this.env.pos.wrongInput(this.el, 'input[name="payment_reference"]');
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.env.pos.passedInput(this.el, 'input[name="payment_reference"]');
            }
            if (changes.payment_date == '') {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Payment Date is required');
                this.env.pos.wrongInput(this.el, 'input[name="payment_date"]');
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.env.pos.passedInput(this.el, 'input[name="payment_date"]');
            }
            if (!changes.payment_method_id) {
                changes['payment_method_id'] = this.props.payment_methods[0].id
            }

        }

        getPayload() {
            this.verifyChanges();
            if (this.orderUiState.isSuccessful) {
                return {
                    values: this.changes
                };
            } else {
                return {
                    values: this.changes,
                    error: this.orderUiState.hasNotice
                };
            }

        }
    }

    PopUpRegisterPayment.template = 'PopUpRegisterPayment';
    PopUpRegisterPayment.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpRegisterPayment);

    return PopUpRegisterPayment
});
