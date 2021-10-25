odoo.define('pos_retail.GiftCardLine', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class GiftCardLine extends PosComponent {
        get highlight() {
            return this.props.gift_card !== this.props.selectedCard ? '' : 'highlight';
        }
    }

    GiftCardLine.template = 'GiftCardLine';

    Registries.Component.add(GiftCardLine);

    return GiftCardLine;
});
