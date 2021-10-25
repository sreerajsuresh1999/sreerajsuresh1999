# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class ProductVariant(models.Model):
    _name = "product.variant"
    _rec_name = "product_tmpl_id"
    _description = "Management sale product variant"

    def name_get(self):
        return [(v.id, "%s - %s - %s" % (v.product_tmpl_id.name, v.attribute_id.name, v.value_id.name)) for v in self]

    product_tmpl_id = fields.Many2one(
        'product.template',
        string='Product Template',
        required=1,
        domain=[('available_in_pos', '=', True)]
    )
    attribute_id = fields.Many2one('product.attribute', 'Attribute', required=1)
    value_id = fields.Many2one('product.attribute.value', string='Value', required=1)
    price_extra = fields.Float('Price extra', help='Price extra will included to public price of product', required=1)

    product_id = fields.Many2one('product.product', 'Product link stock',
                                 help='If choose, will made stock move, automatic compute on hand of this product')
    quantity = fields.Float('Quantity', help='Quantity link stock', default=1)
    active = fields.Boolean('Active', default=1)
    uom_id = fields.Many2one('uom.uom', related='product_id.uom_id', string='Unit Link Stock', store=True, readonly=1)


class ProductAtribute(models.Model):
    _inherit = 'product.attribute'

    multi_choice = fields.Boolean('Multi choose')
