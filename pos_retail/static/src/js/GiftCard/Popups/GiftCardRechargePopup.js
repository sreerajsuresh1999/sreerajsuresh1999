odoo.define('pos_retail.giftCardRechargePopup', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');

    class giftCardRechargePopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.state = useState({ RechargeAmount: 0.00});
            this.RechargeAmount = useRef('RechargeAmount');
        }
        onInputKeyDownNumberVlidation(e) {
            if(e.which != 190 && e.which != 110 && e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && (e.which < 96 || e.which > 105) && (e.which < 37 || e.which > 40)) {
                e.preventDefault();
            }
        }
        getPayload() {
            return {amount:Number(this.state.RechargeAmount)};
        }
        cancel() {
            this.trigger('close-popup');
        }
    }
    giftCardRechargePopup.template = 'giftCardRechargePopup';
    giftCardRechargePopup.defaultProps = {
        confirmText: 'Recharge',
        cancelText: 'Cancel',
        title: '',
        body: '',
    };

    Registries.Component.add(giftCardRechargePopup);

    return giftCardRechargePopup;
});
