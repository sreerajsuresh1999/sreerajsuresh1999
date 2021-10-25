odoo.define('pos_retail.PopUpPrintVoucher', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {useExternalListener} = owl.hooks;
    const contexts = require('point_of_sale.PosContext');
    var core = require('web.core');
    var _t = core._t;

    class PopUpPrintVoucher extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                number: this.props.number,
                value: this.props.value || 0,
                apply_type: 'fixed_amount',
                period_days: this.props.period_days,
                method: 'general',
                state: 'active',
            }
            this.state = useState(this.changes);
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
            if (changes.number == '') {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Number is required')
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = _t('Number is valid')
            }
            if (changes.value <= 0) {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Amount (or %) required bigger than 0')
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = _t('Amount (or %) is valid');
                return;
            }
            if (changes.period_days <= 0) {
                this.orderUiState.isSuccessful = false;
                this.orderUiState.hasNotice = _t('Period Days required bigger than 0');
                return;
            } else {
                this.orderUiState.isSuccessful = true;
                this.orderUiState.hasNotice = _t('Period Days is valid')
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
                    values: {},
                    error: this.orderUiState.hasNotice
                };
            }

        }
    }

    PopUpPrintVoucher.template = 'PopUpPrintVoucher';
    PopUpPrintVoucher.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpPrintVoucher);

    return PopUpPrintVoucher
});
