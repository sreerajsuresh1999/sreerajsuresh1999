odoo.define('pos_retail.AbstractAwaitablePopup', function (require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');

    Registries.Component.add(AbstractAwaitablePopup);

    const RetailAbstractAwaitablePopup = (AbstractAwaitablePopup) =>
        class extends AbstractAwaitablePopup {
            constructor() {
                super(...arguments);
            }

            mounted() {
                super.mounted();
                this.env.pos.openPopup = true
                console.log('[mounted] openPopup open')
            }

            willUnmount() {
                super.willUnmount();
                this.env.pos.openPopup = false
                console.log('[willUnmount] openPopup off')
            }
        }
    Registries.Component.extend(AbstractAwaitablePopup, RetailAbstractAwaitablePopup);

    return RetailAbstractAwaitablePopup;
});
