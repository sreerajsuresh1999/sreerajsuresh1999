odoo.define('pos_retail.OrderSummaryExtend', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;

    class OrderSummaryExtend extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                showSummaryExtend: true,
            });
        }

        get order() {
            return this.env.pos.get_order();
        }

        get client() {
            return this.env.pos.get_order().get_client();
        }

        get promotions() {
            let order = this.env.pos.get_order();
            return order.get_promotions_active()['promotions_active']
        }

        clickShowSummaryExtend() {
            this.state.showSummaryExtend = !this.state.showSummaryExtend
            this.render()
        }

        get isShowSummaryExtend() {
            return this.state.showSummaryExtend
        }

        async applyPromotions() {
            const order = this.env.pos.get_order();
            if (order.is_return) {
                this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Order return not allow Apply Promotions')
                })
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

    }

    OrderSummaryExtend.template = 'OrderSummaryExtend';

    Registries.Component.add(OrderSummaryExtend);

    return OrderSummaryExtend;
});
