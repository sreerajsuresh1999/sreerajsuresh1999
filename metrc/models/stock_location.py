from odoo import models, fields


class StockLocation(models.Model):
    _inherit = 'stock.location'

    location_type_id = fields.Many2one('metrc.location.type', string='METRC Location Type')
    metrc_id = fields.Integer('METRC ID')
    metrc_name = fields.Char('METRC Name')
    location_type_metrc_id = fields.Integer('Location Type METRC ID')
    location_type_name = fields.Char('Location Type METRC Name')
    for_plant_batches = fields.Boolean('For Plant Batches')
    for_plants = fields.Boolean('For Plants')
    for_harvests = fields.Boolean('For Harvests')
    for_packages = fields.Boolean('For Packages')