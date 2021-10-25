# -*- coding: utf-8 -*-
from odoo import api, fields, models, _

class ProductGenericOption(models.Model):
    _name = "product.generic.option"
    _description = "Generic Options of Products"

    name = fields.Char('Name', required=1)
    price_extra = fields.Float('Price Extra', required=1)
    material_ids = fields.One2many(
        'product.generic.option.material',
        'generic_option_id',
        string='Material Redeem Stock'
    )
    product_ids = fields.Many2many(
        'product.product',
        'generic_option_product_rel',
        'generic_option_id',
        'product_id',
        string='Products required Input'
    )


class ProductGenericOptionMaterial(models.Model):
    _name = "product.generic.option.material"
    _description = "Bill Of Material of Generic Options, use for redeem Stock"

    generic_option_id = fields.Many2one('product.generic.option', 'Generic Option', required=1)
    product_id = fields.Many2one(
        'product.product',
        'Product Material',
        required=1,
        domain=[('type', '=', 'product')]
    )
    quantity = fields.Float('Quantity Redeem', required=1, default=1)