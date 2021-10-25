odoo.define('pos_retail.ErrorPopup', function (require) {
    'use strict';

    const ErrorPopup = require('point_of_sale.ErrorPopup');
    const Registries = require('point_of_sale.Registries');
    const {useExternalListener} = owl.hooks;

    const RetailErrorPopup = (ErrorPopup) =>
        class extends ErrorPopup {
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

    Registries.Component.extend(ErrorPopup, RetailErrorPopup);
    return RetailErrorPopup

});
