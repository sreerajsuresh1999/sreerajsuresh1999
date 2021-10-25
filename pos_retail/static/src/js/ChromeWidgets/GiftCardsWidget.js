odoo.define('pos_retail.GiftCardsWidget', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class GiftCardsWidget extends PosComponent {
        async  onClick() {
            this.showScreen('GiftCardScreen');
        }

        get isHidden() {
            if (!this.env || !this.env.pos || !this.env.pos.config || (this.env && this.env.pos && this.env.pos.config && !this.env.pos.config.enable_gift_card)) {
                return true
            } else {
                return false
            }
        }

        get count() {
            return this.env.pos && this.env.pos.db.card_sorted.length
        }

        mounted() {
            posbus.on('reload-gift-cards', this, this.render);
        }

        willUnmount() {
            posbus.off('reload-gift-cards', this, null);
        }
    }

    GiftCardsWidget.template = 'GiftCardsWidget';

    Registries.Component.add(GiftCardsWidget);

    return GiftCardsWidget;
});
