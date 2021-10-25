odoo.define('pos_retail.PopUpSetChequePaymentLine', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const {useExternalListener} = owl.hooks;

    class PopUpSetChequePaymentLine extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                error: null,
                type: 'consu',
                cheque_owner: null,
                cheque_bank_id: null,
                cheque_bank_account: null,
                cheque_check_number: null,
                cheque_card_name: null,
                cheque_card_number: null,
                cheque_card_type: null,
            }
            if (this.props.cheque_owner) {
                this.changes['cheque_owner'] = this.props.cheque_owner
            }
            if (this.props.cheque_bank_id) {
                this.changes['cheque_bank_id'] = this.props.cheque_bank_id
            }
            if (this.props.cheque_bank_account) {
                this.changes['cheque_bank_account'] = this.props.cheque_bank_account
            }
            if (this.props.cheque_check_number) {
                this.changes['cheque_check_number'] = this.props.cheque_check_number
            }
            if (this.env.pos.banks && this.env.pos.banks.length) {
                this.changes['cheque_bank_id'] = this.env.pos.banks[0]['id']
            }
            if (this.props.cheque_card_name) {
                this.changes['cheque_card_name'] = this.props.cheque_card_name
            }
            if (this.props.cheque_card_number) {
                this.changes['cheque_card_number'] = this.props.cheque_card_number
            }
            if (this.props.cheque_card_type) {
                this.changes['cheque_card_type'] = this.props.cheque_card_type
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

        async OnChange(event) {
            const self = this;
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            }
            if (event.target.type == 'file') {
                await this.env.pos.chrome.loadImageFile(event.target.files[0], function (res) {
                    if (res) {
                        var contents = $(self.el);
                        contents.scrollTop(0);
                        contents.find('.client-picture img, .client-picture .fa').remove();
                        contents.find('.client-picture').append("<img src='" + res + "'>");
                        contents.find('.detail.picture').remove();
                        self.changes['image_1920'] = res;
                    }
                });
            }
            if (!['checkbox', 'file'].includes(event.target.type)) {
                this.changes[event.target.name] = event.target.value;
            }
            if (!this.changes['cheque_owner']) {
                this.state.error = this.env._t('Owner Name is required')
                return false
            } else {
                this.state.valid = this.env._t('Ready to Save')
                this.state.error = null
            }
            if (!this.changes['cheque_bank_id']) {
                this.state.error = this.env._t('Bank Name is required')
                return false
            } else {
                this.state.valid = this.env._t('Ready to Save')
                this.state.error = null
            }
            if (!this.changes['cheque_bank_account']) {
                this.state.error = this.env._t('Bank Account is required')
                return false
            } else {
                this.state.valid = this.env._t('Ready to Save')
                this.state.error = null
            }
            if (!this.changes['cheque_check_number']) {
                this.state.error = this.env._t('Cheque Number is required')
                return false
            } else {
                this.state.valid = this.env._t('Ready to Save')
                this.state.error = null
            }
            this.render()
        }


        getPayload() {
            return this.changes
        }
    }

    PopUpSetChequePaymentLine.template = 'PopUpSetChequePaymentLine';
    PopUpSetChequePaymentLine.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpSetChequePaymentLine);

    return PopUpSetChequePaymentLine
});
