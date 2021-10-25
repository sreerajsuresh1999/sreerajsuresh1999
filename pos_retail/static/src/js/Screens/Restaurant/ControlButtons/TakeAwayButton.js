odoo.define('pos_retail.TakeAwayButton', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    /**
     * IMPROVEMENT: Perhaps this class is quite complicated for its worth.
     * This is because it needs to listen to changes to the current order.
     * Also, the current order changes when the selectedOrder in pos is changed.
     * After setting new current order, we update the listeners.
     */
    class TakeAwayButton extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
            this._currentOrder = this.env.pos.get_order();
            this._currentOrder.orderlines.on('change', this.render, this);
            this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
        }

        willUnmount() {
            this._currentOrder.orderlines.off('change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        async onClick() {
            const order = this.env.pos.get_order();
            if (order.hasChangesToPrint()) {
                order.take_away_order = true
                order.saveChanges();
            }
        }

        get addedClasses() {
            if (!this._currentOrder) return {};
            const changes = this._currentOrder.hasChangesToPrint();
            const skipped = changes ? false : this._currentOrder.hasSkippedChanges();
            return {
                highlight: changes,
                altlight: skipped,
            };
        }

        _updateCurrentOrder(pos, newSelectedOrder) {
            this._currentOrder.orderlines.off('change', null, this);
            if (newSelectedOrder) {
                this._currentOrder = newSelectedOrder;
                this._currentOrder.orderlines.on('change', this.render, this);
            }
        }

        get countItemsNeedPrint() {
            let selectedOrder = this.env.pos.get_order();
            if (!selectedOrder) {
                return 0
            }
            let countItemsNeedToPrint = 0
            var printers = this.env.pos.printers;
            for (var i = 0; i < printers.length; i++) {
                var changes = selectedOrder.computeChanges(printers[i].config.product_categories_ids);
                if (changes['new'].length > 0 || changes['cancelled'].length > 0) {
                    countItemsNeedToPrint += changes['new'].length
                    countItemsNeedToPrint += changes['cancelled'].length
                }
            }
            return countItemsNeedToPrint
        }
    }

    TakeAwayButton.template = 'TakeAwayButton';

    ProductScreen.addControlButton({
        component: TakeAwayButton,
        condition: function () {
            return this.env.pos.config.screen_type != 'kitchen' && this.env.pos.config.sync_multi_session && this.env.pos.config.takeaway_order;
        },
        position: ['after', 'SubmitOrderButton'],
    });

    Registries.Component.add(TakeAwayButton);

    return TakeAwayButton;
});
