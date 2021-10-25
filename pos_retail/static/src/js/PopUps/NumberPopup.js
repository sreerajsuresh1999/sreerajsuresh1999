odoo.define('pos_retail.NumberPopup', function (require) {
    'use strict';

    const NumberPopup = require('point_of_sale.NumberPopup');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');
    const {useExternalListener} = owl.hooks;
    const {useBarcodeReader} = require('point_of_sale.custom_hooks');

    const RetailNumberPopup = (NumberPopup) =>
        class extends NumberPopup {
            constructor() {
                super(...arguments);
                useExternalListener(window, 'keyup', this._keyUp);
                useBarcodeReader({
                    validateManager: this._scanbarcode,
                }, true)
            }

            _scanbarcode(code) {
                if (!code || code == "") {
                    return false
                }
                const userValidate = this.env.pos.users.find(u => u.barcode == code)
                if (userValidate) {
                    this.props.resolve({confirmed: true, payload: userValidate['pos_security_pin']});
                    this.trigger('close-popup');
                    this.env.pos.alert_message({
                        title: this.env._t('Successfully'),
                        body: this.env._t('Manager Approved.'),
                        color: 'success'
                    })
                    return true
                }
                return false
            }

            _keyUp(event) {
                if (event.key == 'F1') {
                    this.fullFillValue()
                }
                if (event.key == 'Enter') {
                    this.confirm({detail: this.getPayload()})
                }
            }

            async fullFillValue() {
                this.state.buffer = this.props.fullFillAmount
                this.confirm({detail: this.props.fullFillAmount})
            }
        };

    Registries.Component.extend(NumberPopup, RetailNumberPopup);
    return RetailNumberPopup

});
