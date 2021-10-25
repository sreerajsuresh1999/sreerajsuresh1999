# -*- coding: utf-8 -*-
from odoo import api, models, fields

class barcode_rule(models.Model):

    _inherit = "barcode.rule"

    type = fields.Selection(selection_add=[
        ('order', 'Return Order'),
        ('return_products', 'Return Products'),
        ('fast_order_number', 'Fast order number'),
        ('restaurant_order', 'Restaurant Order'),
    ],  ondelete={
        'order': 'set default',
        'return_products': 'set default',
        'fast_order_number': 'set default',
        'restaurant_order': 'set default',
    })

