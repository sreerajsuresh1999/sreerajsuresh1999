from odoo import models, fields


class PosConfig(models.Model):
    _inherit = 'pos.config'

    facility_id = fields.Many2one('metrc.facility', string='Facility')
