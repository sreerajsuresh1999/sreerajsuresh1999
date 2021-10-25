# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class ProductAddons(models.Model):
    _name = "product.addons"
    _description = "Product Add-ons"

    name = fields.Char('Add-ons Name', required=1)
    include_price_to_product = fields.Boolean(
        'Include Price Add-ons Items',
        help='If checked, all list price of add-ons items will include to Product select them',
        default=1,
    )
    product_ids = fields.Many2many(
        'product.product',
        'product_addons_product_rel',
        'addons_id',
        'product_id',
        string='Addons',
        domain=[('available_in_pos', '=', True)]
    )
