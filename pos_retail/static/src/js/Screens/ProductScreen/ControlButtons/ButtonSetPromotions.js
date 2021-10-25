odoo.define('pos_retail.ButtonSetPromotions', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetPromotions extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
            useListener('open-promotions', this.onClick);
            this._currentOrder = this.env.pos.get_order();
            this._currentOrder.orderlines.on('change', this.render, this);
            this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
        }

        willUnmount() {
            this._currentOrder.orderlines.off('change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        _updateCurrentOrder(pos, newSelectedOrder) {
            this._currentOrder.orderlines.off('change', null, this);
            if (newSelectedOrder) {
                this._currentOrder = newSelectedOrder;
                this._currentOrder.orderlines.on('change', this.render, this);
            }
        }

        async onClick() {
            var order = this.env.pos.get_order();
            if (order.is_return) {
                return false;
            }
            order.remove_all_promotion_line();
            let promotions = order.get_promotions_active()['promotions_active'];
            if (promotions) {
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Apply Promotions !!!'),
                    body: this.env._t('Promotions added before just removed. Are you want add back Promotions to this Order ?'),
                    cancelText: this.env._t('Close'),
                    confirmText: this.env._t('Apply'),
                    cancelIcon: 'fa fa-trash',
                    confirmIcon: 'fa fa-check',
                })
                if (confirmed) {
                    order.apply_promotion()
                    const linesAppliedPromotion = order.orderlines.models.find(l => l.promotion)
                    if (!linesAppliedPromotion) {
                        this.env.pos.alert_message({
                            title: this.env._t('Warning'),
                            body: this.env._t('Have not any Promotions active')
                        })
                    }
                } else {
                    order.remove_all_promotion_line();
                    this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('All Promotions Applied before just Removed'),
                    })
                }
            } else {
                this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Have not any Promotions active')
                })
            }
        }

        get isHighlighted() {
            var order = this.env.pos.get_order();
            if (!order) {
                return false
            }
            if (order.is_return) {
                return false;
            }
            let promotions = order.get_promotions_active()['promotions_active'];
            if (promotions.length) {
                return true
            } else {
                return false
            }
        }
    }

    ButtonSetPromotions.template = 'ButtonSetPromotions';

    ProductScreen.addControlButton({
        component: ButtonSetPromotions,
        condition: function () {
            return this.env.pos.config.promotion_ids.length && this.env.pos.config.promotion_manual_select;
        },
    });

    Registries.Component.add(ButtonSetPromotions);

    return ButtonSetPromotions;
});
