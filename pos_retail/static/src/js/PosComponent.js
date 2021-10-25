odoo.define('pos_retail.RetailPosComponent', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');


    Registries.Component.add(PosComponent);

    const RetailPosComponent = (PosComponent) =>
        class extends PosComponent {
            constructor() {
                super(...arguments);
            }

            mounted() {
                super.mounted();
            }

            willUnmount() {
                super.willUnmount();
            }


            willPatch() {
                super.willPatch();
            }

            patched() {
                super.patched();
            }

            showScreen(name, props) {
                super.showScreen(name, props)
                console.log('[RetailPosComponent] screen name: ' + name)
            }

            showNotification(message, duration = 2000) {
                this.trigger('show-notification', {message, duration});
            }

            closeNotification() {
                this.trigger('close-notification');
            }

        }
    Registries.Component.extend(PosComponent, RetailPosComponent);

    return RetailPosComponent;
});
