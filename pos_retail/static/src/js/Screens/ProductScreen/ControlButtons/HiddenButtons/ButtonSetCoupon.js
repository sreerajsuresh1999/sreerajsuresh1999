odoo.define('pos_retail.ButtonSetCoupon', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetCoupon extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            const selectedOrder = this.env.pos.get_order()
            if (selectedOrder.orderlines.length == 0 || selectedOrder.get_total_with_tax() <= 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your cart is blank or is return Order. It not possible add coupon to return order or blank cart items')
                })
            }
            if (selectedOrder.get_client()) {
                const client = selectedOrder.get_client()
                if (this.env.pos.coupons_by_partner_id && this.env.pos.coupons_by_partner_id[client.id]) {
                    let lists = this.env.pos.coupons_by_partner_id[client.id].map(c => ({
                        id: c.id,
                        label: c.code,
                        item: c
                    }))
                    if (lists.length > 0) {
                        const {confirmed, payload: coupon} = await this.showPopup('SelectionPopup', {
                            title: client.display_name + this.env._t(' have some Coupons, please select one apply to Order'),
                            list: lists
                        })
                        if (confirmed) {
                            return this.env.pos.getInformationCouponPromotionOfCode(coupon.code)
                        }
                    }
                }
            }
            let {confirmed, payload: code} = await this.showPopup('TextInputPopup', {
                title: this.env._t('Promotion/Coupon (Gift/Card) Code ?'),
            })
            if (confirmed) {
                this.env.pos.getInformationCouponPromotionOfCode(code)
            }
        }
    }

    ButtonSetCoupon.template = 'ButtonSetCoupon';

    ProductScreen.addControlButton({
        component: ButtonSetCoupon,
        condition: function () {
            // return this.env.pos.couponPrograms && this.env.pos.couponPrograms.length > 0;
            return false
        },
    });

    Registries.Component.add(ButtonSetCoupon);

    return ButtonSetCoupon;
});
