from odoo import models, fields


class StockWarehouse(models.Model):
    _inherit = 'stock.warehouse'

    facility_id = fields.Many2one('metrc.facility', string='Facility')
