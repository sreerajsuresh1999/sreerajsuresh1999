odoo.define('pos_retail.MobileOrderWidget', function (require) {
    'use strict';

    const MobileOrderWidget = require('point_of_sale.MobileOrderWidget');
    const Registries = require('point_of_sale.Registries');

    const RetailMobileOrderWidget = (MobileOrderWidget) =>
        class extends MobileOrderWidget {
            async selectClient() {
                const selectedOrder = this.env.pos.get_order()
                if (selectedOrder) {
                    this.currentOrder = selectedOrder
                    const currentClient = this.currentOrder.get_client();
                    const {confirmed, payload: newClient} = await this.showTempScreen(
                        'ClientListScreen',
                        {client: currentClient}
                    );
                    if (confirmed) {
                        this.currentOrder.set_client(newClient);
                        this.currentOrder.updatePricelist(newClient);
                    }
                }

            }
        }
    Registries.Component.extend(MobileOrderWidget, RetailMobileOrderWidget);

    return RetailMobileOrderWidget;
});
