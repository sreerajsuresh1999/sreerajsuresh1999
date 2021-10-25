odoo.define('pos_retail.gift_card_models', function (require) {
    "use strict";

    const models = require('point_of_sale.models');
    models.load_fields("pos.payment.method", ['jr_use_for'])

    const _super_paymentline = models.Paymentline.prototype;
    const _super_Order = models.Order.prototype;

    models.PosModel.prototype.models.push({
        model: 'pos.gift.card.type',
        fields: ['name'],
        loaded: function (self, card_type) {
            self.card_type = card_type;
        },
    }, {
        model: 'pos.gift.card',
        domain: [['is_active', '=', true]],
        loaded: function (self, gift_cards) {
            self.db.add_giftcard(gift_cards);
            self.set({'gift_card_order_list': gift_cards});
        },
    });

    models.Order = models.Order.extend({
        initialize: function (attributes, options) {
            var res = _super_Order.initialize.apply(this, arguments);
            this.set({
                rounding: true,
            });
            this.redeem = false;
            this.recharge = false;
            this.giftcard = [];
            this.if_gift_card = false
            return this;
        },
        getOrderReceiptEnv: function () {
            var res = _super_Order.getOrderReceiptEnv.call(this);
            var barcode_val = this.get_giftcard();
            var barcode_recharge_val = this.get_recharge_giftcard();
            var barcode_redeem_val = this.get_redeem_giftcard();

            if (barcode_val && barcode_val[0]) {
                var barcode = barcode_val[0].card_no;
            } else if (barcode_recharge_val) {
                var barcode = barcode_recharge_val.recharge_card_no;
            } else if (barcode_redeem_val) {
                var barcode = barcode_redeem_val.redeem_card;
            }
            if (barcode) {
                var img = new Image();
                img.id = "test-barcode";
                $(img).JsBarcode(barcode.toString());
                res.receipt['barcode'] = $(img)[0] ? $(img)[0].src : false;
            }
            res['widget'] = this.pos
            return res;
        },

        set_is_rounding: function (rounding) {
            this.set('rounding', rounding);
        },
        get_is_rounding: function () {
            return this.get('rounding');
        },
        getNetTotalTaxIncluded: function () {
            var total = this.get_total_with_tax();
            return total;
        },
        // gift_card
        set_giftcard: function (giftcard) {
            this.giftcard.push(giftcard);
        },
        get_giftcard: function () {
            return this.giftcard;
        },
        set_recharge_giftcard: function (recharge) {
            this.recharge = recharge;
        },
        get_recharge_giftcard: function () {
            return this.recharge;
        },
        set_redeem_giftcard: function (redeem) {
            this.redeem = redeem;
        },
        get_redeem_giftcard: function () {
            return this.redeem;
        },
        export_as_JSON: function () {
            var orders = _super_Order.export_as_JSON.call(this);
            orders.giftcard = this.get_giftcard() || false;
            orders.recharge = this.get_recharge_giftcard() || false;
            orders.redeem = this.get_redeem_giftcard() || false;
            return orders;
        },
        export_for_printing: function () {
            var orders = _super_Order.export_for_printing.call(this);
            orders.giftcard = this.get_giftcard() || false;
            orders.recharge = this.get_recharge_giftcard() || false;
            orders.redeem = this.get_redeem_giftcard() || false;
            return orders;
        },
    });

    models.Paymentline = models.Paymentline.extend({
        initialize: function (attributes, options) {
            var self = this;
            _super_paymentline.initialize.apply(this, arguments);
        },
        set_giftcard_line_code: function (gift_card_code) {
            this.gift_card_code = gift_card_code;
        },
        get_giftcard_line_code: function () {
            return this.gift_card_code;
        },
    });

});
