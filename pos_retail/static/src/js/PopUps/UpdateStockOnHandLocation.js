odoo.define('point_of_sale.UpdateStockOnHandLocation', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useExternalListener} = owl.hooks;

    class UpdateStockOnHandLocation extends PosComponent {
        constructor() {
            super(...arguments);
        }

        onKeyup(event) {
            if (event.key === "Enter" && event.target.value.trim() !== '' && !this.props.withLot) {
                this.trigger('create-new-item');
            }
        }
    }

    UpdateStockOnHandLocation.template = 'UpdateStockOnHandLocation';

    Registries.Component.add(UpdateStockOnHandLocation);

    return UpdateStockOnHandLocation;
});
