from odoo import models, fields


class StockProductionLot(models.Model):
    _inherit = 'stock.production.lot'

    facility_id = fields.Many2one('metrc.facility', string='Facility')
    parent_id = fields.Many2one('stock.production.lot', string='Parent Package')
    uom_id = fields.Many2one('uom.uom', string='UOM')
    metrc_id = fields.Char('METRC ID')
    metrc_qty = fields.Float('METRC Quantity')

    def split_metrc_package(self):
        values = {
            'package_id': self.id,
            'warehouse_id': 1,
            'facility_id': self.facility_id.id,
            'uom': self.product_uom_id.name,
        }
        return self.env['metrc.package.split'].sudo().split_popup(values)

