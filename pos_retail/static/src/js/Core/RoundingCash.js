odoo.define('pos_retail.rounding_factor_cash', function (require) {
    const  models = require('point_of_sale.models');
    const  utils = require('web.utils');
    const  field_utils = require('web.field_utils');
    const  round_di = utils.round_decimals;
    const  round_pr = utils.round_precision;
    const retailModel = require('pos_retail.model');

    const  _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            const pos_config_model = this.get_model('pos.config');
            let _loaded_pos_config_model = pos_config_model.loaded;
            pos_config_model.loaded = function (self, configs) {
                _loaded_pos_config_model(self, configs);
                if (self.config.rounding) {
                    for (let decimal_name in self.dp) {
                        if (decimal_name == 'Product Price') {
                            self.dp[decimal_name] = self.config.decimal_places
                        }
                    }
                }
                if (self.config && self.config.manage_orders) {
                    self.config.manage_orders = false // TODO: disable feature manager orders of core odoo original
                }
            };
            _super_PosModel.initialize.apply(this, arguments);
        },
        format_currency_no_symbol: function (amount, precision, currency) {
            if (this.config.rounding) {
                if (!currency) {
                    currency =
                        this && this.currency
                            ? this.currency
                            : {symbol: '$', position: 'after', rounding: 0.01, decimals: 2};
                }
                let decimals = this.config.decimal_places;

                if (precision && this.dp[precision] !== undefined) {
                    decimals = this.dp[precision];
                }

                if (typeof amount === 'number') {
                    amount = round_di(amount, decimals).toFixed(decimals);
                    amount = field_utils.format.float(round_di(amount, decimals), {
                        digits: [69, decimals],
                    });
                }

                return amount;
            } else {
                return _super_PosModel.format_currency_no_symbol.apply(this, arguments);
            }
        },
    })

    let _super_order = models.Order.prototype;
    models.Order = models.Order.extend({
        get_total_with_tax: function () {
            let total_with_tax = _super_order.get_total_with_tax.apply(this, arguments);
            if (this.pos.config.rounding) {
                total_with_tax = round_pr(total_with_tax, this.pos.config.rounding_factor);
            }
            return total_with_tax
        },
        get_total_without_tax: function () {
            let total_without_tax = _super_order.get_total_without_tax.apply(this, arguments);
            if (this.pos.config.rounding) {
                total_without_tax = round_pr(total_without_tax, this.pos.config.rounding_factor);
            }
            return total_without_tax
        },
        get_total_discount: function () {
            let total_discount = _super_order.get_total_discount.apply(this, arguments);
            if (this.pos.config.rounding) {
                total_discount = round_pr(total_discount, this.pos.config.rounding_factor);
            }
            return total_discount
        },
        get_total_tax: function () {
            let total_tax = _super_order.get_total_tax.apply(this, arguments);
            if (this.pos.config.rounding) {
                total_tax = round_pr(total_tax, this.pos.config.rounding_factor);
            }
            return total_tax
        },
        get_total_paid: function () {
            let total_paid = _super_order.get_total_paid.apply(this, arguments);
            if (this.pos.config.rounding) {
                total_paid = round_pr(total_paid, this.pos.config.rounding_factor);
            }
            return total_paid
        },
    });

    let _super_Orderline = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
        get_price_with_tax: function () {
            let price_subtotal_incl = _super_Orderline.get_price_with_tax.apply(this, arguments);
            if (this.pos.config.rounding) {
                price_subtotal_incl = round_pr(price_subtotal_incl, this.pos.config.rounding_factor);
            }
            return price_subtotal_incl;
        },
        get_all_prices: function () {
            let all_prices = _super_Orderline.get_all_prices.apply(this, arguments);
            if (this.pos.config.rounding) {
                all_prices['priceWithTax'] = round_pr(all_prices['priceWithTax'], this.pos.config.rounding_factor);
                all_prices['priceWithoutTax'] = round_pr(all_prices['priceWithoutTax'], this.pos.config.rounding_factor);
            }
            return all_prices
        },
    });

    const _super_Product = models.Product.prototype;
    models.Product = models.Product.extend({
        get_price: function (pricelist, quantity, uom_id) {
            let price = _super_Product.get_price.apply(this, arguments)
            if (window.posmodel.config.rounding) {
                price = round_pr(price, window.posmodel.config.rounding_factor);
            }
            return price
        }
    })
});
