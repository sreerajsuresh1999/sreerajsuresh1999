odoo.define('pos_retail.giftCardEditExpirePopup', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');

    class giftCardEditExpirePopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.state = useState({ NewExpireDate: ''});
            this.NewExpireDate = useRef('NewExpireDate');
        }
        getPayload() {
            return {new_expire_date:this.state.NewExpireDate};
        }
        async confirm() {
            var expDate = this.props.selectedCard.expire_date
            if(this.state.NewExpireDate >= expDate){
               this.props.resolve({ confirmed: true, payload: await this.getPayload() });
               this.trigger('close-popup');
            }
            else{
               alert('Please Select Date After Expiry Date')
            }
        }
        cancel() {
            this.trigger('close-popup');
        }
    }
    giftCardEditExpirePopup.template = 'giftCardEditExpirePopup';
    giftCardEditExpirePopup.defaultProps = {
        confirmText: 'Extend',
        cancelText: 'Cancel',
        title: '',
        body: '',
    };

    Registries.Component.add(giftCardEditExpirePopup);

    return giftCardEditExpirePopup;
});
