from odoo import models, fields


class UomUom(models.Model):
    _inherit = 'uom.uom'

    metrc_name = fields.Char('METRC Name')
    metrc_qty_type = fields.Char('METRC Quantity Type')
