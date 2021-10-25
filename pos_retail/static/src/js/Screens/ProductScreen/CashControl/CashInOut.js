odoo.define('pos_retail.CashInOut', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const {useListener} = require('web.custom_hooks');

    class CashInOut extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                product_id: this.props.product_id,
                reason: this.props.reason,
                amount: this.props.amount,
                session_id: this.props.session_id
            }
            this.state = useState(this.change);
            this.orderUiState = useContext(contexts.orderManagement);
        }

        OnChange(event) {
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            } else {
                this.changes[event.target.name] = event.target.value;
            }
            this.render()
        }


        getPayload() {
            return this.changes
        }
    }

    CashInOut.template = 'CashInOut';
    CashInOut.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
    };

    Registries.Component.add(CashInOut);

    return CashInOut
});
