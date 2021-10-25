odoo.define('pos_retail.FloorScreen', function (require) {
    'use strict';

    const FloorScreen = require('pos_restaurant.FloorScreen');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    const RetailFloorScreen = (FloorScreen) =>
        class extends FloorScreen {
            constructor() {
                super(...arguments);
            }

            mounted() {
                // super.mounted(); // kimanh: we no need call super because super order set table is null
                posbus.on('refresh:FloorScreen', this, this.render);
                if (this.env.pos.iot_connections && this.env.pos.iot_connections.length) {
                    this.env.pos.config.sync_multi_session = true
                }
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('refresh:FloorScreen', this, null);
            }

            async _tableLongpolling() {
                if (this.env.pos.config.sync_multi_session) {
                    return true
                } else {
                    super._tableLongpolling()
                }
            }
        }
    Registries.Component.extend(FloorScreen, RetailFloorScreen);

    return RetailFloorScreen;
});
