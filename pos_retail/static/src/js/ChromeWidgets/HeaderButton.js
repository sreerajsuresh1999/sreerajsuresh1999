odoo.define('pos_retail.HeaderButton', function (require) {
    'use strict';

    const HeaderButton = require('point_of_sale.HeaderButton');
    const Registries = require('point_of_sale.Registries');

    const RetailHeaderButton = (HeaderButton) =>
        class extends HeaderButton {
            constructor() {
                super(...arguments);
                this.confirmed = true;
            }

            onClick() {
                super.onClick()
                this.state.label = this.env._t('Waiting Close');
                this.confirmed = setTimeout(() => {
                    this.state.label =  this.env._t('Close');
                    this.confirmed = true;
                }, 2000);
            }
        }
    Registries.Component.extend(HeaderButton, RetailHeaderButton);

    return RetailHeaderButton;
});
