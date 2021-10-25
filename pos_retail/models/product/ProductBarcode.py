# -*- coding: utf-8 -*-
from odoo import api, fields, models, _

class ProductBarcode(models.Model):
    _name = 'product.barcode'
    _rec_name = 'barcode'
    _description = "Product multi Barcode"

    product_tmpl_id = fields.Many2one('product.template', 'Product Template', required=1)
    product_id = fields.Many2one('product.product', compute='_get_product_id', string='Product')
    pricelist_id = fields.Many2one('product.pricelist', 'Pricelist will Apply', required=1)
    uom_id = fields.Many2one('uom.uom', string='Unit of Measure', required=1)
    barcode = fields.Char('Ean13 or Search String', required=1)

    def _get_product_id(self):
        for barcode in self:
            product = self.env['product.product'].search([
                ('product_tmpl_id', '=', barcode.product_tmpl_id.id)
            ], limit=1)
            barcode.product_id = product.id