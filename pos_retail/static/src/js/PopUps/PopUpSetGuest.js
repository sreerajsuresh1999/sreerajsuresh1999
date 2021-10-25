odoo.define('pos_retail.PopUpSetGuest', function (require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    var core = require('web.core');
    const {useExternalListener} = owl.hooks;

    class PopUpSetGuest extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            let order = this.env.pos.get_order();
            this.changes = {
                guest: order.guest || '',
                guest_number: order.guest_number || 0,
            }
            useExternalListener(window, 'keyup', this._keyUp);
        }

        _keyUp(event) {
            if (event.key == 'Enter') {
                this.confirm()
            }
        }

        OnChange(event) {
            let target_name = event.target.name;
            this.changes[event.target.name] = event.target.value;
        }

        getPayload() {
            return this.changes
        }
    }

    PopUpSetGuest.template = 'PopUpSetGuest';
    PopUpSetGuest.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpSetGuest);

    return PopUpSetGuest
});
