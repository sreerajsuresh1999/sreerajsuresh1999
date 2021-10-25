# -*- coding: utf-8 -*-

from odoo import models, fields

class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    apply_charges = fields.Boolean("Apply Charges")
    fees_amount = fields.Float("Fees Amount")
    fees_type = fields.Selection(
        selection=[('fixed', 'Fixed'), ('percentage', 'Percentage')],
        string="Fees type",
        default="fixed")
    fees_product_id = fields.Many2one(
        'product.product',
        'Fees Product',
        domain=[('sale_ok', '=', True), ('available_in_pos', '=', True)]
    )
    optional = fields.Boolean("Optional")
    shortcut_key = fields.Char('Shortcut Key')
    jr_use_for = fields.Boolean("Gift Card", default=False)

