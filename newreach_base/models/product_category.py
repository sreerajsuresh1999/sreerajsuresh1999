from odoo import models, fields


class ProductCategory(models.Model):
    _inherit = 'product.category'

    limit_ids = fields.One2many('newreach.limit', 'categ_id', string='Limits')
