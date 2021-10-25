odoo.define('pos_retail.ConfirmPopup', function (require) {
    'use strict';

    const ConfirmPopup = require('point_of_sale.ConfirmPopup');
    const Registries = require('point_of_sale.Registries');
    const {useExternalListener} = owl.hooks;

    const RetailConfirmPopup = (ConfirmPopup) =>
        class extends ConfirmPopup {
            constructor() {
                super(...arguments);
                useExternalListener(window, 'keyup', this._keyUp);
            }

            _keyUp(event) {
                if (event.key == 'Enter') {
                    this.confirm()
                }
            }
        };

    Registries.Component.extend(ConfirmPopup, RetailConfirmPopup);
    return RetailConfirmPopup

});
