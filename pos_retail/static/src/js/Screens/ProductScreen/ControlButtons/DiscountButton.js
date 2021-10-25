odoo.define('pos_retail.DiscountButton', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const DiscountButton = require('pos_discount.DiscountButton');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    const RetailDiscountButton = (DiscountButton) =>
        class extends DiscountButton {
            async apply_discount(pc) {
                let product = this.env.pos.db.get_product_by_id(this.env.pos.config.discount_product_id[0]);
                const order = this.env.pos.get_order();
                const lines = order.get_orderlines();
                if (product.taxes_id.length) {
                    let first_tax = this.pos.taxes_by_id[product.taxes_id[0]];
                    if (first_tax.price_include) {
                        return super.apply_discount(pc)
                    }
                }
                const amountTotalWithTaxes = order.get_total_with_tax()
                const amountTotalWithOutTaxes = order.get_total_without_tax();
                if (amountTotalWithTaxes != amountTotalWithOutTaxes) {
                    let {confirmed} = await this.showPopup('ConfirmPopup', {
                        title: this.env._t('Discount Type'),
                        body: this.env._t('You have 2 type of Discount Amount, Please choice one bellow'),
                        confirmText: this.env._t('WithIn Taxes'),
                        cancelText: this.env._t('WithOut Taxes'),
                    })
                    if (confirmed) {
                        if (product === undefined) {
                            await this.env.pos.alert_message({
                                title: this.env._t("No discount product found"),
                                body: this.env._t("The discount product seems misconfigured. Make sure it is flagged as 'Can be Sold' and 'Available in Point of Sale'."),
                            });
                            return;
                        }
                        // Remove existing discounts
                        let i = 0;
                        while (i < lines.length) {
                            if (lines[i].get_product() === product) {
                                order.remove_orderline(lines[i]);
                            } else {
                                i++;
                            }
                        }
                        const base_to_discount = order.get_total_with_tax();
                        const discount = -pc / 100.0 * base_to_discount;
                        if (discount < 0) {
                            order.add_product(product, {
                                price: discount,
                                lst_price: discount,
                                extras: {
                                    price_manually_set: true,
                                },
                            });
                        }
                    } else {
                        return super.apply_discount(pc)
                    }
                } else {
                    return super.apply_discount(pc)
                }
            }
        }
    Registries.Component.extend(DiscountButton, RetailDiscountButton);

    return RetailDiscountButton;
});
