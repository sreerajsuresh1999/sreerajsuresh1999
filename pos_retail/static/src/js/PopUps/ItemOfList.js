odoo.define('point_of_sale.ItemOfList', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class ItemOfList extends PosComponent {
        constructor() {
            super(...arguments);
        }

        onKeyup(event) {
            if (event.key === "Enter" && event.target.value.trim() !== '' && !this.props.withLot) {
                this.trigger('create-new-ItemOfList');
            }
        }
    }

    ItemOfList.template = 'ItemOfList';

    Registries.Component.add(ItemOfList);

    return ItemOfList;
});
