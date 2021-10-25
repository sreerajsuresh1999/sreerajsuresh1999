# -*- coding: utf-8 -*-
from odoo import api, fields, models, _

class product_cross(models.Model):

    _name = "product.cross"
    _description = "Management cross selling products"

    product_tmpl_id = fields.Many2one('product.template', 'Product template', required=1)
    product_id = fields.Many2one('product.product', 'Product Cross Sale', required=1, domain=[('available_in_pos', '=', True)])
    list_price = fields.Float('Sale Price', required=1)
    quantity = fields.Float('Qty', default=1)
    discount_type = fields.Selection([
        ('none', 'None'),
        ('fixed', 'Fixed Value'),
        ('percent', 'Percent %'),
    ], string='Discount Type', default='none')
    discount = fields.Float('Discount Value', default=0)

    @api.onchange('product_id')
    def on_change_product_id(self):
        if self.product_id:
            self.list_price = self.product_id.list_price
