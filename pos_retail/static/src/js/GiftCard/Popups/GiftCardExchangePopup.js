odoo.define('pos_retail.giftCardExchangePopup', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    var rpc = require('web.rpc');
    var core = require('web.core');
    var _t = core._t;

    class giftCardExchangePopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.state = useState({ NewCardNumber: ''});
            this.NewCardNumber = useRef('NewCardNumber');
        }
        onInputKeyDownNumberVlidation(e) {
            if(e.which != 190 && e.which != 110 && e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && (e.which < 96 || e.which > 105) && (e.which < 37 || e.which > 40)) {
                e.preventDefault();
            }
        }
        getPayload() {
            return {NewCardNumber:Number(this.state.NewCardNumber)};
        }
        cancel() {
            this.trigger('close-popup');
        }
    }
    giftCardExchangePopup.template = 'giftCardExchangePopup';
    giftCardExchangePopup.defaultProps = {
        confirmText: 'Replace',
        cancelText: 'Cancel',
        title: '',
        body: '',
    };

    Registries.Component.add(giftCardExchangePopup);

    return giftCardExchangePopup;
});
