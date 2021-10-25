from odoo import models, fields


class NewreachLimit(models.Model):
    _name = 'newreach.limit'

    categ_id = fields.Many2one('product.category')
    adult_limit = fields.Float(string='Adult Limit')
    medical_limit = fields.Float(string='Medical Limit')
    uom_id = fields.Many2one('uom.uom', string='UOM')
