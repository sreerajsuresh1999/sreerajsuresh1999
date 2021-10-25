from odoo import models, fields


class LocationTypes(models.Model):
    _name = 'metrc.location.type'

    metrc_id = fields.Integer("METRC ID")
    name = fields.Char('Name')
    for_plant_batches = fields.Boolean('ForPlantBatches')
    for_plants = fields.Boolean('ForPlants')
    for_harvests = fields.Boolean('ForHarvests')
    for_packages = fields.Boolean('ForPackages')
