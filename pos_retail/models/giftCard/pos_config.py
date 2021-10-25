# -*- coding: utf-8 -*-

from odoo import models, fields, api


class POSConfig(models.Model):
    _inherit = 'pos.config'

    enable_gift_card = fields.Boolean('Active Feature Gift Card')
    gift_card_account_id = fields.Many2one('account.account', string="Gift Card Account")
    gift_card_product_id = fields.Many2one(
        'product.product',
        domain=[('available_in_pos', '=', True)],
        string="Gift Card Product",
        help="Product add to cart when adding new Card"
    )
    gift_payment_method_id = fields.Many2one('pos.payment.method', string="Payment Method")
    manual_card_number = fields.Boolean('Manual Card No.')
    msg_before_card_pay = fields.Boolean('Confirm Message Before Card Payment')

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
