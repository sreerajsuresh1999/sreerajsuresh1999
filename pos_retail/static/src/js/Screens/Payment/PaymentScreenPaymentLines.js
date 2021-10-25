odoo.define('pos_retail.PaymentScreenPaymentLines', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const PaymentScreenPaymentLines = require('point_of_sale.PaymentScreenPaymentLines');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    const RetailPaymentScreenPaymentLines = (PaymentScreenPaymentLines) =>
        class extends PaymentScreenPaymentLines {
            formatLineAmount(paymentline) {
                return this.env.pos.format_currency(paymentline.get_amount());
            }
        }

    Registries.Component.extend(PaymentScreenPaymentLines, RetailPaymentScreenPaymentLines);
    PaymentScreenPaymentLines.template = 'RetailPaymentScreenPaymentLines'

    return RetailPaymentScreenPaymentLines;
});
